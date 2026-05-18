import { getTransferSolInstruction } from '@solana-program/system';
import {
    Account,
    Address,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    GetAccountInfoApi,
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
    PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import { isValidInstructionPlan, REALLOC_LIMIT } from './internals';
import {
    getAccountSize,
    getExtendInstructionPlan,
    getWriteInstructionPlan,
    MetadataInput,
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
        closeBuffer?: Address | boolean;
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
        ...(input.data.length > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: input.metadata,
                      authority: input.authority,
                      extraLength: input.data.length,
                      program: input.program,
                      programData: input.programData,
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
        buffer: Address;
        dataLength: number;
        payer: TransactionSigner;
        closeBuffer?: Address | boolean;
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
        ...(input.dataLength > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: input.metadata,
                      authority: input.authority,
                      extraLength: input.dataLength,
                      program: input.program,
                      programData: input.programData,
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
                      destination: typeof input.closeBuffer === 'string' ? input.closeBuffer : input.payer.address,
                  }),
              ]
            : []),
    ]);
}
