import { getCreateAccountInstruction, getTransferSolInstruction } from '@solana-program/system';
import {
    Account,
    Address,
    ClientWithGetMinimumBalance,
    parallelInstructionPlan,
    ReadonlyUint8Array,
    sequentialInstructionPlan,
    TransactionSigner,
} from '@solana/kit';

import {
    Buffer,
    findCanonicalPda,
    findNonCanonicalPda,
    getAllocateInstruction,
    getCloseInstruction,
    getSetAuthorityInstruction,
    getWriteInstruction,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
    SeedArgs,
} from './generated';
import { REALLOC_LIMIT } from './internals';
import { getAccountSize, getExtendInstructionPlan, getWriteInstructionPlan } from './utils';

/**
 * Builds a plan that creates a brand new buffer account owned by a fresh
 * keypair. The account is created via the system program's `CreateAccount`
 * instruction; the buffer authority is the `input.authority` signer.
 *
 * Use {@link getCreateCanonicalBufferInstructionPlan} or
 * {@link getCreateNonCanonicalBufferInstructionPlan} to create PDA-backed
 * buffer accounts instead.
 */
export async function getCreateBufferInstructionPlan(
    client: ClientWithGetMinimumBalance,
    input: {
        newBuffer: TransactionSigner;
        authority: TransactionSigner;
        payer: TransactionSigner;
        sourceBuffer?: Account<Buffer>;
        closeSourceBuffer?: Address | boolean;
        data?: ReadonlyUint8Array;
    },
) {
    if (!input.data && !input.sourceBuffer) {
        throw new Error('Either `data` or `sourceBuffer` must be provided to create a buffer.');
    }

    const data = (input.sourceBuffer?.data.data ?? input.data) as ReadonlyUint8Array;
    const rent = await client.getMinimumBalance(Number(getAccountSize(data.length)));

    return sequentialInstructionPlan([
        getCreateAccountInstruction({
            payer: input.payer,
            newAccount: input.newBuffer,
            lamports: rent,
            space: getAccountSize(data.length),
            programAddress: PROGRAM_METADATA_PROGRAM_ADDRESS,
        }),
        getAllocateInstruction({
            buffer: input.newBuffer.address,
            authority: input.newBuffer,
        }),
        getSetAuthorityInstruction({
            account: input.newBuffer.address,
            authority: input.newBuffer,
            newAuthority: input.authority.address,
        }),
        ...(input.sourceBuffer
            ? [
                  getWriteInstruction({
                      buffer: input.newBuffer.address,
                      authority: input.authority,
                      sourceBuffer: input.sourceBuffer.address,
                      offset: 0,
                  }),
              ]
            : [
                  parallelInstructionPlan([
                      getWriteInstructionPlan({
                          buffer: input.newBuffer.address,
                          authority: input.authority,
                          data,
                      }),
                  ]),
              ]),
        ...(input.sourceBuffer && input.closeSourceBuffer
            ? [
                  getCloseInstruction({
                      account: input.sourceBuffer.address,
                      authority: input.authority,
                      destination:
                          typeof input.closeSourceBuffer === 'string' ? input.closeSourceBuffer : input.payer.address,
                  }),
              ]
            : []),
    ]);
}

/**
 * Builds a plan that creates a canonical buffer account at a PDA derived from
 * `program` and `seed`. The buffer is authority-managed by the program upgrade
 * authority — `input.authority` must therefore match the upgrade authority and
 * `input.programData` must be provided.
 *
 * The plan funds the account via a SOL transfer, allocates it via the
 * program-metadata `allocate` instruction, extends it when necessary, and
 * writes `data` into it (when provided).
 */
export async function getCreateCanonicalBufferInstructionPlan(
    client: ClientWithGetMinimumBalance,
    input: {
        authority: TransactionSigner;
        buffer?: Address;
        closeBuffer?: Address | boolean;
        data?: ReadonlyUint8Array;
        dataLength?: number;
        payer: TransactionSigner;
        program: Address;
        programData: Address;
        seed: SeedArgs;
    },
) {
    const buffer = input.buffer ?? (await findCanonicalPda({ program: input.program, seed: input.seed }))[0];
    return await getPdaBufferInstructionPlan(client, {
        ...input,
        buffer,
        program: input.program,
        programData: input.programData,
    });
}

/**
 * Builds a plan that creates a non-canonical buffer account at a PDA derived
 * from `program`, `seed` and `authority`. The buffer is managed by
 * `input.authority` directly.
 *
 * The plan funds the account via a SOL transfer, allocates it via the
 * program-metadata `allocate` instruction, extends it when necessary, and
 * writes `data` into it (when provided).
 */
export async function getCreateNonCanonicalBufferInstructionPlan(
    client: ClientWithGetMinimumBalance,
    input: {
        authority: TransactionSigner;
        buffer?: Address;
        closeBuffer?: Address | boolean;
        data?: ReadonlyUint8Array;
        dataLength?: number;
        payer: TransactionSigner;
        program: Address;
        seed: SeedArgs;
    },
) {
    const buffer =
        input.buffer ??
        (
            await findNonCanonicalPda({
                authority: input.authority.address,
                program: input.program,
                seed: input.seed,
            })
        )[0];
    return await getPdaBufferInstructionPlan(client, { ...input, buffer });
}

async function getPdaBufferInstructionPlan(
    client: ClientWithGetMinimumBalance,
    input: {
        authority: TransactionSigner;
        buffer: Address;
        closeBuffer?: Address | boolean;
        data?: ReadonlyUint8Array;
        dataLength?: number;
        payer: TransactionSigner;
        program: Address;
        programData?: Address;
        seed: SeedArgs;
    },
) {
    const dataLength = input.dataLength ?? input.data?.length ?? 0;
    const rent = await client.getMinimumBalance(Number(getAccountSize(dataLength)));
    return sequentialInstructionPlan([
        getTransferSolInstruction({
            source: input.payer,
            destination: input.buffer,
            amount: rent,
        }),
        getAllocateInstruction({
            buffer: input.buffer,
            authority: input.authority,
            program: input.program,
            programData: input.programData,
            seed: input.seed,
        }),
        ...(dataLength > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: input.buffer,
                      authority: input.authority,
                      extraLength: dataLength,
                      program: input.program,
                      programData: input.programData,
                  }),
              ]
            : []),
        ...(input.data
            ? [
                  parallelInstructionPlan([
                      getWriteInstructionPlan({
                          buffer: input.buffer,
                          authority: input.authority,
                          data: input.data,
                      }),
                  ]),
              ]
            : []),
        ...(input.closeBuffer
            ? [
                  getCloseInstruction({
                      account: input.buffer,
                      authority: input.authority,
                      program: input.program,
                      programData: input.programData,
                      destination: typeof input.closeBuffer === 'string' ? input.closeBuffer : input.payer.address,
                  }),
              ]
            : []),
    ]);
}
