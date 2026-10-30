import { getTransferSolInstruction } from '@solana-program/system';
import {
    Account,
    Address,
    bytesEqual,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    GetAccountInfoApi,
    HasAddress,
    InstructionPlan,
    parallelInstructionPlan,
    ReadonlyUint8Array,
    sequentialInstructionPlan,
    TransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';

import {
    Buffer,
    fetchBuffer,
    getAllocateInstruction,
    getCloseInstruction,
    getInitializeInstruction,
    getWriteInstruction,
    InitializeInput,
    Metadata,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import { getCloseDestination, isValidInstructionPlan } from './internals';
import {
    getAccountSize,
    getExtendInstructionPlan,
    getWriteInstructionPlan,
    MetadataInput,
    needsExtend,
    resolveMetadataPda,
} from './utils';

type CreateMetadataClient = ClientWithGetMinimumBalance &
    ClientWithRpc<GetAccountInfoApi> &
    ClientWithTransactionPlanning &
    ClientWithTransactionSending;

/**
 * Creates a new metadata account for the given program.
 *
 * When `input.metadata` is omitted, the PDA is derived from `program`, `seed`
 * and — for non-canonical metadata accounts — `authority`. When `input.buffer`
 * is provided as an address, the buffer account is fetched to determine its
 * data length.
 */
export async function createMetadata(
    client: CreateMetadataClient,
    input: MetadataInput,
): Promise<TransactionPlanResult> {
    const [metadata, buffer] = await Promise.all([
        resolveMetadataPda(input),
        input.buffer ? fetchBuffer(client.rpc, input.buffer) : Promise.resolve(undefined),
    ]);
    const plan = await getCreateMetadataInstructionPlan(client, { ...input, buffer, metadata });
    return await client.sendTransactions(plan);
}

export async function getCreateMetadataInstructionPlan(
    client: ClientWithGetMinimumBalance & ClientWithTransactionPlanning,
    input: Omit<InitializeInput, 'data'> & {
        buffer?: Account<Buffer>;
        data?: ReadonlyUint8Array;
        payer: TransactionSigner;
        closeBuffer?: Address | HasAddress | boolean;
        singleExtendPerTransaction?: boolean;
    },
): Promise<InstructionPlan> {
    if (!input.buffer && !input.data) {
        throw new Error('Either `buffer` or `data` must be provided to create a new metadata account.');
    }

    if (input.buffer) {
        return await getCreateMetadataInstructionPlanUsingExistingBuffer(client, {
            ...input,
            buffer: input.buffer.address,
            dataLength: input.buffer.data.data.length,
        });
    }

    const data = input.data as ReadonlyUint8Array;
    const usingInstructionDataPlan = await getCreateMetadataInstructionPlanUsingInstructionData(client, {
        ...input,
        data,
    });
    const validPlan = await isValidInstructionPlan(usingInstructionDataPlan, client);
    return validPlan
        ? usingInstructionDataPlan
        : await getCreateMetadataInstructionPlanUsingNewBuffer(client, { ...input, data });
}

/**
 * Resumes an interrupted create when the metadata account PDA already holds a
 * pre-allocated buffer.
 *
 * The create flow allocates the metadata account PDA as a buffer, writes the
 * data into it and finally initializes it as a metadata account. If a run is
 * interrupted before the `initialize` instruction executes, the PDA is left
 * holding a fully written buffer that the update flow cannot handle — its
 * `set_data` instruction requires an initialized metadata account.
 *
 * When the desired data is already present, the plan consists of a single
 * `initialize` instruction. Otherwise the buffer is grown (if needed) and the
 * data rewritten before initializing. Buffer accounts cannot shrink, so a
 * pre-allocated buffer larger than the desired data is rejected with guidance.
 */
export async function getResumeMetadataInstructionPlan(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data' | 'metadata'> & {
        buffer?: Account<Buffer>;
        closeBuffer?: Address | HasAddress | boolean;
        data?: ReadonlyUint8Array;
        metadata: Account<Metadata>;
        payer: TransactionSigner;
        singleExtendPerTransaction?: boolean;
    },
): Promise<InstructionPlan> {
    if (input.buffer?.address === input.metadata.address) {
        throw new Error('`buffer` must not be the metadata account itself when resuming a pre-allocated buffer.');
    }
    const currentData = input.metadata.data.data as ReadonlyUint8Array;
    // Prefer `buffer` over `data`, matching the create and update flows.
    const desiredData = input.buffer?.data.data ?? input.data;
    if (desiredData === undefined) {
        throw new Error('Either `data` or `buffer` must be provided to resume a pre-allocated metadata buffer.');
    }
    if (desiredData.length < currentData.length) {
        throw new Error(
            `The metadata account at ${input.metadata.address} holds a pre-allocated buffer of ${currentData.length} ` +
                `bytes which is larger than the ${desiredData.length} bytes to store, and buffer accounts cannot be ` +
                `trimmed. Close it (eg. \`close-buffer ${input.metadata.address}\`) and retry to create the metadata ` +
                `account from scratch.`,
        );
    }
    const growth = desiredData.length - currentData.length;
    return sequentialInstructionPlan([
        ...(growth > 0
            ? [
                  getTransferSolInstruction({
                      source: input.payer,
                      destination: input.metadata.address,
                      amount: await client.getMinimumBalance(growth, { withoutHeader: true }),
                  }),
                  getExtendInstructionPlan({
                      account: input.metadata.address,
                      authority: input.authority,
                      extraLength: growth,
                      program: input.program,
                      programData: input.programData,
                      singleExtendPerTransaction: input.singleExtendPerTransaction,
                  }),
              ]
            : []),
        ...(!bytesEqual(currentData, desiredData)
            ? [
                  input.buffer
                      ? getWriteInstruction({
                            buffer: input.metadata.address,
                            authority: input.authority,
                            sourceBuffer: input.buffer.address,
                            offset: 0,
                        })
                      : parallelInstructionPlan([
                            getWriteInstructionPlan({
                                buffer: input.metadata.address,
                                authority: input.authority,
                                data: desiredData,
                            }),
                        ]),
              ]
            : []),
        getInitializeInstruction({
            ...input,
            metadata: input.metadata.address,
            system: PROGRAM_METADATA_PROGRAM_ADDRESS,
            data: undefined,
        }),
        ...(input.buffer && input.closeBuffer
            ? [
                  getCloseInstruction({
                      account: input.buffer.address,
                      authority: input.authority,
                      destination: getCloseDestination(input.closeBuffer, input.payer.address),
                  }),
              ]
            : []),
    ]);
}

export async function getCreateMetadataInstructionPlanUsingInstructionData(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data'> & {
        data?: ReadonlyUint8Array;
        payer: TransactionSigner;
    },
) {
    const dataLength = input.data?.length ?? 0;
    const rent = await client.getMinimumBalance(Number(getAccountSize(dataLength)));
    return sequentialInstructionPlan([
        getTransferSolInstruction({
            source: input.payer,
            destination: input.metadata,
            amount: rent,
        }),
        getInitializeInstruction(input),
    ]);
}

export async function getCreateMetadataInstructionPlanUsingNewBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data'> & {
        data: ReadonlyUint8Array;
        payer: TransactionSigner;
        singleExtendPerTransaction?: boolean;
    },
) {
    const rent = await client.getMinimumBalance(Number(getAccountSize(input.data.length)));
    return sequentialInstructionPlan([
        getTransferSolInstruction({
            source: input.payer,
            destination: input.metadata,
            amount: rent,
        }),
        getAllocateInstruction({
            buffer: input.metadata,
            authority: input.authority,
            program: input.program,
            programData: input.programData,
            seed: input.seed,
        }),
        ...(needsExtend(input.data.length)
            ? [
                  getExtendInstructionPlan({
                      account: input.metadata,
                      authority: input.authority,
                      extraLength: input.data.length,
                      program: input.program,
                      programData: input.programData,
                      singleExtendPerTransaction: input.singleExtendPerTransaction,
                  }),
              ]
            : []),
        parallelInstructionPlan([
            getWriteInstructionPlan({
                buffer: input.metadata,
                authority: input.authority,
                data: input.data,
            }),
        ]),
        getInitializeInstruction({
            ...input,
            system: PROGRAM_METADATA_PROGRAM_ADDRESS,
            data: undefined,
        }),
    ]);
}

export async function getCreateMetadataInstructionPlanUsingExistingBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data'> & {
        buffer: Address | HasAddress;
        dataLength: number;
        payer: TransactionSigner;
        closeBuffer?: Address | HasAddress | boolean;
        singleExtendPerTransaction?: boolean;
    },
) {
    const rent = await client.getMinimumBalance(Number(getAccountSize(input.dataLength)));
    return sequentialInstructionPlan([
        getTransferSolInstruction({
            source: input.payer,
            destination: input.metadata,
            amount: rent,
        }),
        getAllocateInstruction({
            buffer: input.metadata,
            authority: input.authority,
            program: input.program,
            programData: input.programData,
            seed: input.seed,
        }),
        ...(needsExtend(input.dataLength)
            ? [
                  getExtendInstructionPlan({
                      account: input.metadata,
                      authority: input.authority,
                      extraLength: input.dataLength,
                      program: input.program,
                      programData: input.programData,
                      singleExtendPerTransaction: input.singleExtendPerTransaction,
                  }),
              ]
            : []),
        getWriteInstruction({
            buffer: input.metadata,
            authority: input.authority,
            sourceBuffer: input.buffer,
            offset: 0,
        }),
        getInitializeInstruction({
            ...input,
            system: PROGRAM_METADATA_PROGRAM_ADDRESS,
            data: undefined,
        }),
        ...(input.closeBuffer
            ? [
                  getCloseInstruction({
                      account: input.buffer,
                      authority: input.authority,
                      destination: getCloseDestination(input.closeBuffer, input.payer.address),
                  }),
              ]
            : []),
    ]);
}
