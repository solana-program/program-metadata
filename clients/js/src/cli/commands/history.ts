import fs from 'fs';
import path from 'path';

import { Address, getBase58Decoder, getBase58Encoder, Rpc, SolanaRpcApi } from '@solana/kit';
import { Option } from 'commander';
import picocolors from 'picocolors';

import { Compression, Encoding, findMetadataPda, Seed } from '../../generated';
import { unpackDirectData } from '../../packData';
import { programArgument, seedArgument } from '../arguments';
import { logCommand, logErrorAndExit } from '../logs';
import {
    GlobalOptions,
    nonCanonicalReadOption,
    NonCanonicalReadOption,
    outputOption,
    OutputOption,
} from '../options';
import { CustomCommand, getKeyPairSigners, getReadonlyClient } from '../utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const METADATA_PROGRAM_STR = 'ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S';

/** Instruction discriminators (first byte of instruction data). */
const DISC = {
    Write: 0,
    Initialize: 1,
    SetAuthority: 2,
    SetData: 3,
    SetImmutable: 4,
    Trim: 5,
    Close: 6,
    Allocate: 7,
    Extend: 8,
} as const;

const DISC_NAME: Record<number, string> = {
    0: 'Write',
    1: 'Initialize',
    2: 'SetAuthority',
    3: 'SetData',
    4: 'SetImmutable',
    5: 'Trim',
    6: 'Close',
    7: 'Allocate',
    8: 'Extend',
};

// ─── State types ─────────────────────────────────────────────────────────────

/**
 * Virtual reconstruction of the on-chain account state at a given point in
 * time.  Fields mirror the Header / Buffer structs in the Rust program.
 */
type VirtualState = {
    /** 0 = Empty, 1 = Buffer, 2 = Metadata */
    discriminator: 0 | 1 | 2;
    authority: Address | null;
    mutable: boolean;
    canonical: boolean;
    /** 16-byte seed (zero-padded). */
    seed: Uint8Array<ArrayBuffer>;
    encoding: number;
    compression: number;
    format: number;
    /** 0 = Direct, 1 = Url, 2 = External */
    dataSource: number;
    dataLength: number;
    /** Raw data bytes (after the 96-byte header). */
    data: Uint8Array<ArrayBuffer>;
};

type Snapshot = {
    slot: bigint;
    blockTime: bigint | null;
    signature: string;
    instruction: string;
    /** null when the account has been closed. */
    state: VirtualState | null;
    /** Decompressed + decoded string content, if data source is Direct. */
    decodedContent: string | null;
};

// ─── Minimal RPC response shapes ─────────────────────────────────────────────

type SigInfo = {
    signature: string;
    slot: bigint;
    blockTime: bigint | null; // @solana/kit returns UnixTimestamp as bigint
    err: unknown;
};

type CompiledInstruction = {
    programIdIndex: number;
    accounts: number[];
    /** Base58-encoded raw instruction bytes. */
    data: string;
};

type InnerInstructionGroup = {
    index: number; // outer instruction index this group belongs to
    instructions: CompiledInstruction[];
};

type ParsedTx = {
    slot: bigint;
    blockTime: bigint | null;
    transaction: {
        message: {
            accountKeys: string[];
            instructions: CompiledInstruction[];
        };
    };
    meta: {
        err: unknown;
        innerInstructions?: InnerInstructionGroup[] | null;
    } | null;
};

// ─── Low-level helpers ────────────────────────────────────────────────────────

/**
 * Decode a base58-encoded instruction data string to raw bytes.
 * `getBase58Encoder().encode(str)` converts a base58 string to the raw bytes
 * it represents (kit encoder convention: TS value → on-chain bytes).
 */
function fromBase58(b58: string): Uint8Array<ArrayBuffer> {
    try {
        // getBase58Encoder().encode converts a base58 string to the raw bytes it
        // represents (kit encoder convention: TS value → on-chain bytes).
        // Wrapping in new Uint8Array() materialises the ReadonlyUint8Array as a
        // mutable, ArrayBuffer-backed Uint8Array.
        return new Uint8Array(getBase58Encoder().encode(b58));
    } catch {
        return new Uint8Array(0);
    }
}

/** Read a little-endian u32 from a Uint8Array at the given offset. */
function readU32LE(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            ((bytes[offset + 3] << 24) >>> 0)) >>>
        0
    );
}

/**
 * Convert 32 raw bytes (starting at `offset`) to a base58-encoded Solana
 * address string.  `getBase58Decoder().decode()` converts raw bytes to a
 * base58 string (kit decoder convention: on-chain bytes → TS value).
 */
function rawBytesToAddress(bytes: Uint8Array<ArrayBuffer>, offset: number): Address {
    const slice = bytes.slice(offset, offset + 32);
    return getBase58Decoder().decode(slice) as Address;
}

/**
 * Write `chunk` into `buf` at `dstOffset`, growing `buf` if necessary.
 * Returns the (possibly reallocated) buffer.
 */
function writeChunk(
    buf: Uint8Array<ArrayBuffer>,
    chunk: Uint8Array<ArrayBuffer>,
    dstOffset: number,
): Uint8Array<ArrayBuffer> {
    const needed = dstOffset + chunk.length;
    if (needed > buf.length) {
        const grown = new Uint8Array(needed);
        grown.set(buf);
        buf = grown;
    }
    buf.set(chunk, dstOffset);
    return buf;
}

function cloneState(s: VirtualState): VirtualState {
    return {
        ...s,
        seed: new Uint8Array(s.seed) as Uint8Array<ArrayBuffer>,
        data: new Uint8Array(s.data) as Uint8Array<ArrayBuffer>,
    };
}

function emptyState(): VirtualState {
    return {
        discriminator: 0,
        authority: null,
        mutable: true,
        canonical: false,
        seed: new Uint8Array(16),
        encoding: 0,
        compression: 0,
        format: 0,
        dataSource: 0,
        dataLength: 0,
        data: new Uint8Array(0),
    };
}

/**
 * Flatten a transaction's outer and inner instructions into a single list in
 * their correct execution order:
 *   outer[0], inner[0][0], inner[0][1], …, outer[1], inner[1][0], …
 *
 * This is necessary because the metadata program is commonly invoked via CPI
 * from multisig programs (e.g. Squads), which means its instructions only
 * appear in `meta.innerInstructions`, not the top-level instruction list.
 */
function flattenInstructions(tx: ParsedTx): CompiledInstruction[] {
    const result: CompiledInstruction[] = [];
    const innerByOuterIdx = new Map<number, CompiledInstruction[]>();

    for (const group of tx.meta?.innerInstructions ?? []) {
        innerByOuterIdx.set(group.index, group.instructions);
    }

    tx.transaction.message.instructions.forEach((outerIx, idx) => {
        result.push(outerIx);
        const inner = innerByOuterIdx.get(idx);
        if (inner) result.push(...inner);
    });

    return result;
}

// ─── RPC helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch all confirmed signatures for `addr`, oldest-first.
 * Paginates using the `before` cursor until the RPC returns fewer than 1000
 * results.
 */
async function fetchAllSignatures(rpc: Rpc<SolanaRpcApi>, addr: Address): Promise<SigInfo[]> {
    const all: SigInfo[] = [];
    let before: string | undefined;

    for (;;) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const batch = (await (rpc as any)
            .getSignaturesForAddress(addr, {
                limit: 1000,
                ...(before ? { before } : {}),
            })
            .send()) as SigInfo[];

        if (!batch || batch.length === 0) break;
        all.push(...batch);
        before = batch[batch.length - 1].signature;
        if (batch.length < 1000) break;
    }

    // RPC returns newest-first; reverse so we process oldest-first.
    return all.reverse();
}

/**
 * Fetch a single transaction in the legacy JSON format (base58 instruction
 * data + numeric account-key indices).
 */
async function fetchTx(rpc: Rpc<SolanaRpcApi>, sig: string): Promise<ParsedTx | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rpc as any)
        .getTransaction(sig, {
            maxSupportedTransactionVersion: 0,
            encoding: 'json',
        })
        .send() as Promise<ParsedTx | null>;
}

// ─── Buffer reconstruction ────────────────────────────────────────────────────

/**
 * Reconstruct the data-section bytes of a buffer account by replaying its
 * Allocate + Write transaction history.  Returns only the bytes *after* the
 * 96-byte header (i.e. the payload that will be copied into the metadata
 * account by Initialize or SetData).
 */
async function reconstructBufferData(
    rpc: Rpc<SolanaRpcApi>,
    bufferAddr: Address,
): Promise<Uint8Array<ArrayBuffer>> {
    let data: Uint8Array<ArrayBuffer> = new Uint8Array(0);

    let sigs: SigInfo[];
    try {
        sigs = await fetchAllSignatures(rpc, bufferAddr);
    } catch {
        return data;
    }

    for (const sigInfo of sigs) {
        if (sigInfo.err) continue;

        let tx: ParsedTx | null;
        try {
            tx = await fetchTx(rpc, sigInfo.signature);
        } catch {
            continue;
        }
        if (!tx?.transaction?.message) continue;

        const keys = tx.transaction.message.accountKeys;
        const targetIdx = keys.indexOf(bufferAddr as string);
        if (targetIdx === -1) continue;

        for (const ix of flattenInstructions(tx)) {
            if (keys[ix.programIdIndex] !== METADATA_PROGRAM_STR) continue;
            if (ix.accounts[0] !== targetIdx) continue;

            const bytes = fromBase58(ix.data);
            if (bytes.length === 0) continue;
            const disc = bytes[0];

            if (disc === DISC.Allocate) {
                // Re-allocation resets the buffer contents.
                data = new Uint8Array(0);
            } else if (disc === DISC.Write && bytes.length >= 5) {
                const offset = readU32LE(bytes, 1);
                const chunk = bytes.slice(5);
                if (chunk.length > 0) {
                    data = writeChunk(data, chunk, offset);
                }
                // If chunk is empty and there is a source_buffer at accounts[2]
                // we intentionally skip it to avoid unbounded recursion. In
                // practice the source_buffer path is extremely rare.
            }
        }
    }

    return data;
}

// ─── State machine ────────────────────────────────────────────────────────────

/**
 * Apply one compiled instruction to the virtual account state.
 * Returns the updated state, whether the account was closed, and the
 * human-readable instruction name.
 */
async function applyInstruction(
    state: VirtualState,
    ix: CompiledInstruction,
    keys: string[],
    rpc: Rpc<SolanaRpcApi>,
): Promise<{ next: VirtualState; closed: boolean; name: string }> {
    const bytes = fromBase58(ix.data);
    if (bytes.length === 0) return { next: state, closed: false, name: 'Unknown' };

    const disc = bytes[0];
    const name = DISC_NAME[disc] ?? `Unknown(${disc})`;
    const next = cloneState(state);

    switch (disc) {
        case DISC.Allocate: {
            // Reset account to Buffer state.
            next.discriminator = 1;
            next.data = new Uint8Array(0);
            next.dataLength = 0;
            // bytes[1..17] = seed (only present for PDA buffers)
            if (bytes.length >= 17) next.seed = bytes.slice(1, 17);
            if (ix.accounts.length >= 2) next.authority = keys[ix.accounts[1]] as Address;
            // Presence of a program account (index 2) indicates a PDA buffer.
            next.canonical = ix.accounts.length >= 3;
            break;
        }

        case DISC.Write: {
            // Layout: [disc(1)] [offset u32 LE(4)] [data…]
            if (bytes.length < 5) break;
            const offset = readU32LE(bytes, 1);
            const inline = bytes.slice(5);

            if (inline.length > 0) {
                next.data = writeChunk(next.data, inline, offset);
            } else if (ix.accounts.length >= 3) {
                // No inline data → copy from source_buffer at accounts[2].
                const srcAddr = keys[ix.accounts[2]] as Address;
                const srcData = await reconstructBufferData(rpc, srcAddr);
                next.data = writeChunk(next.data, srcData, offset);
            }
            break;
        }

        case DISC.Initialize: {
            // Layout: [disc(1)] [seed(16)] [encoding(1)] [compression(1)]
            //         [format(1)] [dataSource(1)] [data…]
            if (bytes.length < 21) break;
            next.seed = bytes.slice(1, 17);
            next.encoding = bytes[17];
            next.compression = bytes[18];
            next.format = bytes[19];
            next.dataSource = bytes[20];
            if (ix.accounts.length >= 2) next.authority = keys[ix.accounts[1]] as Address;
            next.canonical = ix.accounts.length >= 3;

            if (next.discriminator === 1) {
                // Buffer-path: account was pre-filled via Write; flip discriminator,
                // keep existing data bytes.
                next.discriminator = 2;
                next.dataLength = next.data.length;
            } else {
                // Direct-path: inline data follows the fixed header bytes.
                next.discriminator = 2;
                const inline = bytes.slice(21);
                next.data = inline;
                next.dataLength = inline.length;
            }
            break;
        }

        case DISC.SetData: {
            // Layout: [disc(1)] [encoding(1)] [compression(1)] [format(1)]
            //         [dataSource(1)]? [data…]?
            if (bytes.length < 4) break;
            next.encoding = bytes[1];
            next.compression = bytes[2];
            next.format = bytes[3];

            if (bytes.length >= 5) {
                next.dataSource = bytes[4];

                if (bytes.length > 5) {
                    // Inline data.
                    const inline = bytes.slice(5);
                    next.data = inline;
                    next.dataLength = inline.length;
                } else if (ix.accounts.length >= 3) {
                    // dataSource byte present but no inline data → use buffer at accounts[2].
                    const bufAddr = keys[ix.accounts[2]] as Address;
                    const bufData = await reconstructBufferData(rpc, bufAddr);
                    next.data = bufData;
                    next.dataLength = bufData.length;
                }
            } else if (ix.accounts.length >= 3) {
                // No dataSource byte; data comes from buffer at accounts[2].
                next.dataSource = 0; // Direct
                const bufAddr = keys[ix.accounts[2]] as Address;
                const bufData = await reconstructBufferData(rpc, bufAddr);
                next.data = bufData;
                next.dataLength = bufData.length;
            }
            // bytes.length === 4 with no buffer: header-only update, data unchanged.
            break;
        }

        case DISC.SetAuthority: {
            // Layout: [disc(1)] [newAuthority(32)]  (all-zero = remove authority)
            if (bytes.length >= 33) {
                const allZero = bytes.slice(1, 33).every(b => b === 0);
                next.authority = allZero ? null : rawBytesToAddress(bytes, 1);
            } else {
                next.authority = null;
            }
            break;
        }

        case DISC.SetImmutable: {
            next.mutable = false;
            break;
        }

        case DISC.Close: {
            return { next, closed: true, name };
        }

        case DISC.Trim:
        case DISC.Extend:
            // Rent operations — no logical change to data content.
            break;
    }

    return { next, closed: false, name };
}

// ─── History reconstruction ───────────────────────────────────────────────────

async function reconstructHistory(rpc: Rpc<SolanaRpcApi>, metadataAddr: Address): Promise<Snapshot[]> {
    const sigs = await fetchAllSignatures(rpc, metadataAddr);
    const snapshots: Snapshot[] = [];
    let state = emptyState();

    for (const sigInfo of sigs) {
        if (sigInfo.err) continue; // Skip failed transactions.

        let tx: ParsedTx | null;
        try {
            tx = await fetchTx(rpc, sigInfo.signature);
        } catch {
            continue;
        }
        if (!tx?.transaction?.message) continue;
        if (tx.meta?.err) continue; // Transaction itself failed on-chain.

        const keys = tx.transaction.message.accountKeys;
        const targetIdx = keys.indexOf(metadataAddr as string);
        if (targetIdx === -1) continue;

        // Collect all instructions (outer + CPI inner) that target the metadata
        // program AND have our account as their first operand.
        const relevant = flattenInstructions(tx).filter(
            ix =>
                keys[ix.programIdIndex] === METADATA_PROGRAM_STR &&
                ix.accounts[0] === targetIdx,
        );
        if (relevant.length === 0) continue;

        let lastName = 'Unknown';
        let closed = false;

        for (const ix of relevant) {
            const result = await applyInstruction(state, ix, keys, rpc);
            state = result.next;
            lastName = result.name;
            if (result.closed) {
                closed = true;
                break;
            }
        }

        snapshots.push({
            slot: sigInfo.slot,
            blockTime: sigInfo.blockTime,
            signature: sigInfo.signature,
            instruction: lastName,
            state: closed ? null : cloneState(state),
            decodedContent: closed ? null : tryDecode(state),
        });

        if (closed) break;
    }

    return snapshots;
}

// ─── Decoding ─────────────────────────────────────────────────────────────────

/** Attempt to decompress and decode the data bytes to a string. */
function tryDecode(state: VirtualState): string | null {
    if (state.discriminator !== 2) return null;
    if (state.dataSource !== 0) return null; // Only Direct data supported here.
    if (state.dataLength === 0) return null;

    try {
        return unpackDirectData({
            data: state.data.slice(0, state.dataLength),
            compression: state.compression as Compression,
            encoding: state.encoding as Encoding,
        });
    } catch {
        return null;
    }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const FORMAT_NAME = ['none', 'json', 'yaml', 'toml'];
const ENCODING_NAME = ['none', 'utf8', 'base58', 'base64'];
const COMPRESSION_NAME = ['none', 'gzip', 'zlib'];
const DISC_LABEL = ['Empty', 'Buffer', 'Metadata'];

function fmtTime(blockTime: bigint | null): string {
    if (!blockTime) return 'unknown time         ';
    return new Date(Number(blockTime) * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

function displaySnapshots(snapshots: Snapshot[]): void {
    const count = snapshots.length;
    console.log(picocolors.bold(`Found ${count} state change${count === 1 ? '' : 's'}:\n`));

    for (const snap of snapshots) {
        const slot = picocolors.cyan(snap.slot.toString().padStart(14));
        const time = picocolors.dim(fmtTime(snap.blockTime));
        const instr = picocolors.yellow(snap.instruction.padEnd(14));

        if (!snap.state) {
            console.log(`${slot}  ${time}  ${instr}  ${picocolors.red('CLOSED')}`);
            console.log(`               ${' '.repeat(21)} ${picocolors.dim('sig: ' + snap.signature)}\n`);
            continue;
        }

        const { state } = snap;
        const discLabel = DISC_LABEL[state.discriminator] ?? 'Unknown';
        let dataInfo: string;

        if (state.discriminator === 2) {
            const fmt = FORMAT_NAME[state.format] ?? `fmt(${state.format})`;
            const enc = ENCODING_NAME[state.encoding] ?? `enc(${state.encoding})`;
            const cmp = COMPRESSION_NAME[state.compression] ?? `cmp(${state.compression})`;
            const mutable = state.mutable ? '' : picocolors.red(' immutable');
            dataInfo = picocolors.green(`${state.dataLength} bytes`) + `  ${fmt}/${enc}/${cmp}${mutable}`;
        } else {
            dataInfo = picocolors.dim(discLabel + (state.data.length > 0 ? `  ${state.data.length} bytes buffered` : ''));
        }

        console.log(`${slot}  ${time}  ${instr}  ${dataInfo}`);
        console.log(`               ${' '.repeat(21)} ${picocolors.dim('sig: ' + snap.signature)}`);

        if (snap.decodedContent !== null) {
            const preview =
                snap.decodedContent.length > 140
                    ? snap.decodedContent.slice(0, 140) + picocolors.dim('…')
                    : snap.decodedContent;
            console.log(`               ${' '.repeat(21)} ${picocolors.dim('↳')} ${preview}`);
        }

        console.log();
    }
}

function saveSnapshots(snapshots: Snapshot[], outDir: string): void {
    fs.mkdirSync(outDir, { recursive: true });

    for (const snap of snapshots) {
        const filename = `${snap.slot}_${snap.instruction.toLowerCase()}.json`;
        const filepath = path.join(outDir, filename);

        const serialisable = {
            slot: snap.slot.toString(),
            blockTime: snap.blockTime !== null ? Number(snap.blockTime) : null,
            signature: snap.signature,
            instruction: snap.instruction,
            state: snap.state
                ? {
                    discriminator: snap.state.discriminator,
                    authority: snap.state.authority,
                    mutable: snap.state.mutable,
                    canonical: snap.state.canonical,
                    seed: Buffer.from(snap.state.seed).toString('hex'),
                    encoding: ENCODING_NAME[snap.state.encoding] ?? snap.state.encoding,
                    compression: COMPRESSION_NAME[snap.state.compression] ?? snap.state.compression,
                    format: FORMAT_NAME[snap.state.format] ?? snap.state.format,
                    dataSource: snap.state.dataSource,
                    dataLength: snap.state.dataLength,
                    data: Buffer.from(snap.state.data.slice(0, snap.state.dataLength)).toString('base64'),
                }
                : null,
            decodedContent: snap.decodedContent,
        };

        fs.writeFileSync(filepath, JSON.stringify(serialisable, null, 2));
    }
}

/**
 * Write each *distinct* decoded IDL to its own file in `outDir`.
 * Consecutive snapshots with identical content are skipped — only genuine
 * changes produce a new file.  Filenames are:
 *   <slot>_v<version>.json   (when the IDL JSON contains a "version" field)
 *   <slot>.json              (otherwise)
 */
function dumpDistinctIdls(snapshots: Snapshot[], outDir: string): number {
    fs.mkdirSync(outDir, { recursive: true });
    let prevContent: string | null = null;
    let written = 0;

    for (const snap of snapshots) {
        if (snap.decodedContent === null) continue;
        if (snap.decodedContent === prevContent) continue;
        prevContent = snap.decodedContent;

        let version: string | null = null;
        try {
            const parsed = JSON.parse(snap.decodedContent) as Record<string, unknown>;
            const v = parsed['version'] ?? (parsed['metadata'] as Record<string, unknown> | undefined)?.['version'];
            if (typeof v === 'string') version = v;
        } catch {}

        const suffix = version ? `_v${version}` : '';
        const filename = `${snap.slot}${suffix}.json`;
        fs.writeFileSync(path.join(outDir, filename), snap.decodedContent);
        written++;
    }

    return written;
}

// ─── CLI command ──────────────────────────────────────────────────────────────

export function setHistoryCommand(program: CustomCommand): void {
    program
        .command('history')
        .description('Reconstruct the state history of a metadata account from its on-chain transactions.')
        .addArgument(seedArgument)
        .addArgument(programArgument)
        .addOption(nonCanonicalReadOption)
        .addOption(outputOption)
        .addOption(new Option('--dump-idls <dir>', 'Write each distinct IDL version to a separate file in <dir>.'))
        .action(doHistory);
}

type Options = NonCanonicalReadOption & OutputOption & { dumpIdls?: string };

async function doHistory(seed: Seed, program: Address, _: Options, cmd: CustomCommand): Promise<void> {
    const options = cmd.optsWithGlobals() as GlobalOptions & Options;
    const client = getReadonlyClient(options);

    const authority =
        options.nonCanonical === true
            ? (await getKeyPairSigners(options, client.configs))[0].address
            : options.nonCanonical
              ? (options.nonCanonical as Address)
              : null;

    const [metadataAddr] = await findMetadataPda({ program, authority, seed });

    logCommand('Reconstructing metadata history...', {
        metadata: metadataAddr,
        program,
        seed: seed as string,
        authority: authority ?? undefined,
    });

    let snapshots: Snapshot[];
    try {
        snapshots = await reconstructHistory(client.rpc, metadataAddr);
    } catch (err) {
        logErrorAndExit((err as Error).message ?? String(err));
    }

    if (snapshots.length === 0) {
        console.log(picocolors.yellow('No transactions found for this metadata account.'));
        return;
    }

    displaySnapshots(snapshots);

    if (options.output) {
        saveSnapshots(snapshots, options.output);
        console.log(picocolors.green(`Saved ${snapshots.length} snapshot(s) to ${picocolors.bold(options.output)}`));
    }

    if (options.dumpIdls) {
        const written = dumpDistinctIdls(snapshots, options.dumpIdls);
        console.log(picocolors.green(`Wrote ${written} distinct IDL version(s) to ${picocolors.bold(options.dumpIdls)}`));
    }
}
