import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    Account,
    AccountRole,
    Address,
    address,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    Commitment,
    compileTransaction,
    createClient,
    createKeyPairSignerFromBytes,
    createNoopSigner,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    extendClient,
    flattenTransactionPlan,
    GetAccountInfoApi,
    GetLatestBlockhashApi,
    getTransactionEncoder,
    InstructionPlanInput,
    MessageSigner,
    pipe,
    Rpc,
    RpcSubscriptions,
    setTransactionMessageComputeUnitLimit,
    setTransactionMessageLifetimeUsingBlockhash,
    SolanaRpcApi,
    SolanaRpcSubscriptionsApi,
    TransactionMessage,
    TransactionPlan,
    TransactionPlanExecutor,
    TransactionSigner,
} from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { identity, payer } from '@solana/kit-plugin-signer';
import { Command } from 'commander';
import picocolors from 'picocolors';
import { parse as parseYaml } from 'yaml';

import { Buffer, DataSource, Encoding, fetchBuffer, findMetadataPda, Format, Seed, SeedArgs } from '../generated';
import { decodeData, packDirectData, PackedData, packExternalData, packUrlData } from '../packData';
import { getProgramAuthority } from '../utils';
import { programMetadataProgram } from '../plugin';
import { logErrorAndExit, logExports, logSuccess, logWarning } from './logs';
import {
    ExportEncodingOption,
    ExportOption,
    GlobalOptions,
    KeypairOption,
    NonCanonicalWriteOption,
    PayerOption,
    RpcOption,
    WriteOptions,
} from './options';

const LOCALHOST_URL = 'http://127.0.0.1:8899';
const DATA_SOURCE_OPTIONS =
    '`[file]`, `--buffer <address>`, `--text <content>`, `--url <url>` or `--account <address>`';

export class CustomCommand extends Command {
    createCommand(name: string) {
        return new CustomCommand(name);
    }

    tap(fn: (command: CustomCommand) => void) {
        fn(this);
        return this;
    }
}

/**
 * The CLI client returned by {@link getClient}: a Solana RPC client extended
 * with the program metadata plugin (`client.programMetadata.*`), plus a few
 * CLI-only fields (`configs`, `runOrExport`).
 */
export type Client = Awaited<ReturnType<typeof getClient>>;

export async function getClient(options: GlobalOptions) {
    const configs = getSolanaConfigs();
    const rpcUrl = getRpcUrl(options, configs);
    const rpcSubscriptionsUrl = getRpcSubscriptionsUrl(rpcUrl, configs);
    const [identitySigner, payerSigner] = await getKeyPairSigners(options, configs);

    return createClient()
        .use(payer(payerSigner))
        .use(identity(identitySigner))
        .use(
            solanaRpc({
                rpcUrl,
                rpcSubscriptionsUrl,
                transactionConfig: { microLamportsPerComputeUnit: options.priorityFees },
            }),
        )
        .use(programMetadataProgram())
        .use(cliConfigs(configs))
        .use(cliRunOrExport(options));
}

/**
 * Plugin that attaches the parsed `~/.config/solana/cli/config.yml` to the
 * client so commands that need to introspect Solana config defaults can read
 * them without re-parsing the file.
 */
function cliConfigs(configs: SolanaConfigs) {
    return <T extends object>(client: T) => extendClient(client, { configs });
}

/**
 * Plugin that attaches a `runOrExport` helper to the client. The helper plans
 * the given instruction(s) and then either executes them through the client's
 * transaction plan executor or exports them as encoded transactions, depending
 * on whether `--export` was passed.
 */
function cliRunOrExport(options: ExportOption & ExportEncodingOption) {
    return <
        T extends ClientWithRpc<GetLatestBlockhashApi> &
            ClientWithTransactionPlanning & {
                transactionPlanExecutor: TransactionPlanExecutor;
            },
    >(
        client: T,
    ) =>
        extendClient(client, {
            runOrExport: async (input: InstructionPlanInput | Promise<InstructionPlanInput>): Promise<void> => {
                const transactionPlan = await client.planTransactions(await input);
                if (options.export) {
                    await exportTransactionPlan(transactionPlan, client, options);
                } else {
                    // TODO: progress + error handling.
                    await client.transactionPlanExecutor(transactionPlan);
                    logSuccess('Operation executed successfully');
                }
            },
        });
}

async function exportTransactionPlan(
    transactionPlan: TransactionPlan,
    client: ClientWithRpc<GetLatestBlockhashApi>,
    options: ExportOption & ExportEncodingOption,
) {
    const singleTransactions = flattenTransactionPlan(transactionPlan);
    const transactionEncoder = getTransactionEncoder();

    logExports(singleTransactions.length, options);

    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send();

    for (let i = 0; i < singleTransactions.length; i++) {
        const message = pipe(
            singleTransactions[i].message,
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => setTransactionMessageComputeUnitLimit(undefined, m),
        );
        const prefix = picocolors.yellow(`[Transaction #${i + 1}]`);
        if (options.exportEncoding === 'instruction-list') {
            console.log(`\n${prefix}`);
            logInstructions(message);
        } else {
            const transaction = compileTransaction(message);
            const encodedTransaction = decodeData(transactionEncoder.encode(transaction), options.exportEncoding);
            console.log(`${prefix}\n${encodedTransaction}\n`);
        }
    }
}

function logInstructions(message: TransactionMessage): void {
    message.instructions.forEach((ix, i) => {
        console.log(picocolors.cyan(`\n------ IX #${i + 1} ------\n`));
        console.log(`${ix.programAddress}\n`);

        (ix.accounts ?? []).forEach(account => {
            const isWritable = account.role === AccountRole.WRITABLE || account.role === AccountRole.WRITABLE_SIGNER;
            const isSigner =
                account.role === AccountRole.READONLY_SIGNER || account.role === AccountRole.WRITABLE_SIGNER;
            const writable = isWritable ? 'W' : '';
            const signer = isSigner ? 'S' : '';
            console.log(`${String(account.address).padEnd(44)} ${writable.padStart(2)} ${signer.padStart(1)}`);
        });

        console.log('');

        if (ix.data && ix.data.length > 0) {
            console.log(`${decodeData(ix.data, Encoding.Base58)}\n`);
        }
    });
}

export type ReadonlyClient = {
    configs: SolanaConfigs;
    rpc: Rpc<SolanaRpcApi>;
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
};

export function getReadonlyClient(options: RpcOption): ReadonlyClient {
    const configs = getSolanaConfigs();
    const rpcUrl = getRpcUrl(options, configs);
    const rpcSubscriptionsUrl = getRpcSubscriptionsUrl(rpcUrl, configs);
    return {
        configs,
        rpc: createSolanaRpc(rpcUrl),
        rpcSubscriptions: createSolanaRpcSubscriptions(rpcSubscriptionsUrl),
    };
}

function getRpcUrl(options: RpcOption, configs: SolanaConfigs): string {
    if (options.rpc) return options.rpc;
    if (configs.json_rpc_url) return configs.json_rpc_url;
    return LOCALHOST_URL;
}

function getRpcSubscriptionsUrl(rpcUrl: string, configs: SolanaConfigs): string {
    if (configs.websocket_url) return configs.websocket_url;
    return rpcUrl.replace(/^http/, 'ws').replace(/:8899$/, ':8900');
}

type SolanaConfigs = {
    json_rpc_url?: string;
    websocket_url?: string;
    keypair_path?: string;
    commitment?: Commitment;
};

function getSolanaConfigs(): SolanaConfigs {
    const path = getSolanaConfigPath();
    if (!fs.existsSync(path)) {
        logWarning('Solana config file not found');
        return {};
    }
    return parseYaml(fs.readFileSync(getSolanaConfigPath(), 'utf8')) as SolanaConfigs;
}

function getSolanaConfigPath(): string {
    return path.join(os.homedir(), '.config', 'solana', 'cli', 'config.yml');
}

export async function getKeyPairSigners(
    options: KeypairOption & PayerOption & ExportOption,
    configs: SolanaConfigs,
): Promise<[TransactionSigner & MessageSigner, TransactionSigner & MessageSigner]> {
    if (typeof options.export === 'string') {
        const exportSigner = createNoopSigner(options.export);
        return [exportSigner, exportSigner];
    }
    const keypairPath = getKeyPairPath(options, configs);
    const keypairPromise = getKeyPairSignerFromPath(keypairPath);
    const payerPromise = options.payer ? getKeyPairSignerFromPath(options.payer) : keypairPromise;
    return await Promise.all([keypairPromise, payerPromise]);
}

function getKeyPairPath(options: KeypairOption, configs: SolanaConfigs): string {
    if (options.keypair) return options.keypair;
    if (configs.keypair_path) return configs.keypair_path;
    return path.join(os.homedir(), '.config', 'solana', 'id.json');
}

async function getKeyPairSignerFromPath(keypairPath: string) {
    if (!fs.existsSync(keypairPath)) {
        logErrorAndExit(`Keypair file not found at: ${keypairPath}`);
    }
    const keypairString = fs.readFileSync(keypairPath, 'utf-8');
    const keypairData = new Uint8Array(JSON.parse(keypairString));
    return await createKeyPairSignerFromBytes(keypairData);
}

export function getFormatFromFile(file: string | undefined): Format {
    if (!file) return Format.None;
    const extension = path.extname(file);
    switch (extension) {
        case '.json':
            return Format.Json;
        case '.yaml':
        case '.yml':
            return Format.Yaml;
        case '.toml':
            return Format.Toml;
        default:
            return Format.None;
    }
}

export type PdaDetails = {
    metadata: Address;
    isCanonical: boolean;
    programData?: Address;
};

/**
 * Fetches the on-chain state of `program` to determine whether the metadata
 * account is canonical (i.e. the caller's authority matches the program's
 * upgrade authority) and returns the resolved metadata PDA along with the
 * associated program-data account when applicable.
 */
export async function getPdaDetails(input: {
    rpc: Rpc<GetAccountInfoApi>;
    program: Address;
    authority: TransactionSigner | Address;
    seed: SeedArgs;
}): Promise<PdaDetails> {
    const authorityAddress = typeof input.authority === 'string' ? input.authority : input.authority.address;
    const { authority, programData } = await getProgramAuthority(input.rpc, input.program);
    const isCanonical = !!authority && authority === authorityAddress;
    const [metadata] = await findMetadataPda({
        program: input.program,
        authority: isCanonical ? null : authorityAddress,
        seed: input.seed,
    });
    return { metadata, isCanonical, programData };
}

export async function getPdaDetailsForWriting(
    client: Client,
    options: NonCanonicalWriteOption,
    program: Address,
    seed: Seed,
): Promise<PdaDetails> {
    const details = await getPdaDetails({ rpc: client.rpc, authority: client.identity, program, seed });
    assertValidIsCanonical(details.isCanonical, options);
    const isCanonical = !options.nonCanonical;
    return {
        programData: isCanonical ? details.programData : undefined,
        metadata: details.metadata,
        isCanonical,
    };
}

export async function getWriteInput(
    client: Client,
    file: string | undefined,
    options: WriteOptions,
): Promise<
    PackedData & {
        buffer?: Account<Buffer>;
        format: Format;
        closeBuffer?: Address | boolean;
    }
> {
    const buffer = options.buffer ? await fetchBuffer(client.rpc, options.buffer) : undefined;
    return {
        ...getPackedData(file, options),
        format: options.format ?? getFormatFromFile(file),
        closeBuffer: options.buffer ? options.closeBuffer : true,
        buffer,
    };
}

export function getPackedData(file: string | undefined, options: WriteOptions): PackedData {
    const { compression, encoding } = options;
    let packData: PackedData | null = null;
    const assertSingleUse = () => {
        if (packData) {
            logErrorAndExit(`Multiple data sources provided. Use only one of: ${DATA_SOURCE_OPTIONS} to provide data.`);
        }
    };

    if (file) {
        if (!fs.existsSync(file)) {
            logErrorAndExit(`File not found: ${file}`);
        }
        const fileContent = fs.readFileSync(file, 'utf-8');
        packData = packDirectData({ content: fileContent, compression, encoding });
    }
    if (options.buffer) {
        assertSingleUse();
        packData = {
            data: new Uint8Array(0),
            compression,
            encoding,
            dataSource: DataSource.Direct,
        };
    }
    if (options.text) {
        assertSingleUse();
        packData = packDirectData({ content: options.text, compression, encoding });
    }
    if (options.url) {
        assertSingleUse();
        packData = packUrlData({ url: options.url, compression, encoding });
    }
    if (options.account) {
        assertSingleUse();
        packData = packExternalData({
            address: address(options.account),
            offset: options.accountOffset ? parseInt(options.accountOffset) : undefined,
            length: options.accountLength ? parseInt(options.accountLength) : undefined,
            compression,
            encoding,
        });
    }

    if (!packData) {
        logErrorAndExit(`No data provided. Use ${DATA_SOURCE_OPTIONS} to provide data.`);
    }

    return packData;
}

export function writeFile(filepath: string, content: string): void {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, content);
}

export function assertValidIsCanonical(isCanonical: boolean, options: NonCanonicalWriteOption): void {
    const wantsCanonical = !options.nonCanonical;
    if (wantsCanonical && !isCanonical) {
        logErrorAndExit(
            'You must be the program authority or an authorized authority to manage canonical metadata accounts. ' +
                'Use the `--non-canonical` option to manage metadata accounts as a third party.',
        );
    }
}
