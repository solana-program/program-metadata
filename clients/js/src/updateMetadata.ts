import { getTransferSolInstruction } from '@solana-program/system';
import {
    Account,
    Address,
    assertAccountExists,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    generateKeyPairSigner,
    GetMultipleAccountsApi,
    HasAddress,
    InstructionPlan,
    lamports,
    Lamports,
    ReadonlyUint8Array,
    sequentialInstructionPlan,
    TransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';

import { getCreateBufferInstructionPlan } from './createBuffer';
import {
    Buffer,
    getCloseInstruction,
    getSetDataInstruction,
    getTrimInstruction,
    Metadata,
    SetDataInput,
} from './generated';
import {
    decodeMaybeMetadataOrBuffer,
    fetchMetadataAndBuffer,
    getCloseDestination,
    isPreAllocatedBuffer,
    isValidInstructionPlan,
} from './internals';
import { getExtendInstructionPlan, MetadataInput, REALLOC_LIMIT, resolveMetadataPda } from './utils';

type UpdateMetadataClient = ClientWithGetMinimumBalance &
    ClientWithRpc<GetMultipleAccountsApi> &
    ClientWithTransactionPlanning &
    ClientWithTransactionSending;

/**
 * Updates an existing metadata account.
 *
 * When `input.metadata` is omitted, the PDA is derived from `program`, `seed`
 * and — for non-canonical metadata accounts — `authority`. The current
 * metadata account is fetched to compute the size difference. When
 * `input.buffer` is provided as an address, the buffer account is fetched
 * alongside it to determine its data length.
 */
export async function updateMetadata(
    client: UpdateMetadataClient,
    input: MetadataInput,
): Promise<TransactionPlanResult> {
    const metadata = await resolveMetadataPda(input);
    const [encodedMetadata, buffer] = await fetchMetadataAndBuffer(client.rpc, metadata, input.buffer);
    const metadataAccount = decodeMaybeMetadataOrBuffer(encodedMetadata);
    assertAccountExists<Buffer | Metadata>(metadataAccount);
    const plan = await getUpdateMetadataInstructionPlan(client, {
        ...input,
        metadata: metadataAccount,
        buffer,
    });
    return await client.sendTransactions(plan);
}

export async function getUpdateMetadataInstructionPlan(
    client: ClientWithGetMinimumBalance & ClientWithTransactionPlanning,
    input: Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
        metadata: Account<Buffer> | Account<Metadata>;
        buffer?: Account<Buffer>;
        data?: ReadonlyUint8Array;
        payer: TransactionSigner;
        closeBuffer?: Address | HasAddress | boolean;
        singleExtendPerTransaction?: boolean;
    },
): Promise<InstructionPlan> {
    if (!input.buffer && !input.data) {
        throw new Error('Either `buffer` or `data` must be provided to update a metadata account.');
    }
    const { metadata } = input;
    if (isPreAllocatedBuffer(metadata)) {
        // The `set_data` instruction requires an initialized metadata account,
        // so fail before planning any buffer transactions.
        throw new Error(
            `The metadata account at ${metadata.address} holds a pre-allocated buffer left by an ` +
                'interrupted create. Write or create the metadata account instead to resume that create.',
        );
    }
    if (!metadata.data.mutable) {
        throw new Error('Metadata account is immutable');
    }

    if (input.buffer) {
        return await getUpdateMetadataInstructionPlanUsingExistingBuffer(client, {
            ...input,
            buffer: input.buffer.address,
            dataLength: input.buffer.data.data.length,
            metadata,
        });
    }

    const data = input.data as ReadonlyUint8Array;
    const usingInstructionDataPlan = await getUpdateMetadataInstructionPlanUsingInstructionData(client, {
        ...input,
        data,
        metadata,
    });
    const validPlan = await isValidInstructionPlan(usingInstructionDataPlan, client);
    if (validPlan) return usingInstructionDataPlan;

    const newBuffer = await generateKeyPairSigner();
    return await getUpdateMetadataInstructionPlanUsingNewBuffer(client, {
        ...input,
        buffer: newBuffer,
        data,
        metadata,
    });
}

export async function getUpdateMetadataInstructionPlanUsingInstructionData(
    client: ClientWithGetMinimumBalance,
    input: Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
        data: ReadonlyUint8Array;
        metadata: Account<Metadata>;
        payer: TransactionSigner;
    },
) {
    const sizeDifference = BigInt(input.data.length) - BigInt(input.metadata.data.data.length);
    const extraRent = await getExtraRent(client, sizeDifference);
    return sequentialInstructionPlan([
        ...(sizeDifference > 0
            ? [
                  getTransferSolInstruction({
                      source: input.payer,
                      destination: input.metadata.address,
                      amount: extraRent,
                  }),
              ]
            : []),
        getSetDataInstruction({ ...input, metadata: input.metadata.address }),
        ...(sizeDifference < 0
            ? [
                  getTrimInstruction({
                      account: input.metadata.address,
                      authority: input.authority,
                      destination: input.payer.address,
                      program: input.program,
                      programData: input.programData,
                  }),
              ]
            : []),
    ]);
}

export async function getUpdateMetadataInstructionPlanUsingNewBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
        buffer: TransactionSigner;
        closeBuffer?: Address | HasAddress | boolean;
        data: ReadonlyUint8Array;
        metadata: Account<Metadata>;
        payer: TransactionSigner;
        singleExtendPerTransaction?: boolean;
    },
) {
    const sizeDifference = BigInt(input.data.length) - BigInt(input.metadata.data.data.length);
    const extraRent = await getExtraRent(client, sizeDifference);
    return sequentialInstructionPlan([
        ...(sizeDifference > 0
            ? [
                  getTransferSolInstruction({
                      source: input.payer,
                      destination: input.metadata.address,
                      amount: extraRent,
                  }),
              ]
            : []),
        ...(sizeDifference > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: input.metadata.address,
                      authority: input.authority,
                      extraLength: Number(sizeDifference),
                      program: input.program,
                      programData: input.programData,
                      singleExtendPerTransaction: input.singleExtendPerTransaction,
                  }),
              ]
            : []),
        await getCreateBufferInstructionPlan(client, {
            newBuffer: input.buffer,
            authority: input.authority,
            payer: input.payer,
            data: input.data,
        }),
        getSetDataInstruction({
            ...input,
            metadata: input.metadata.address,
            buffer: input.buffer.address,
            data: undefined,
        }),
        ...(input.closeBuffer
            ? [
                  getCloseInstruction({
                      account: input.buffer.address,
                      authority: input.authority,
                      destination: getCloseDestination(input.closeBuffer, input.payer.address),
                  }),
              ]
            : []),
        ...(sizeDifference < 0
            ? [
                  getTrimInstruction({
                      account: input.metadata.address,
                      authority: input.authority,
                      destination: input.payer.address,
                      program: input.program,
                      programData: input.programData,
                  }),
              ]
            : []),
    ]);
}

export async function getUpdateMetadataInstructionPlanUsingExistingBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
        buffer: Address | HasAddress;
        closeBuffer?: Address | HasAddress | boolean;
        dataLength: number;
        metadata: Account<Metadata>;
        payer: TransactionSigner;
        singleExtendPerTransaction?: boolean;
    },
) {
    const sizeDifference = BigInt(input.dataLength) - BigInt(input.metadata.data.data.length);
    const extraRent = await getExtraRent(client, sizeDifference);
    return sequentialInstructionPlan([
        ...(sizeDifference > 0
            ? [
                  getTransferSolInstruction({
                      source: input.payer,
                      destination: input.metadata.address,
                      amount: extraRent,
                  }),
              ]
            : []),
        ...(sizeDifference > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: input.metadata.address,
                      authority: input.authority,
                      extraLength: Number(sizeDifference),
                      program: input.program,
                      programData: input.programData,
                      singleExtendPerTransaction: input.singleExtendPerTransaction,
                  }),
              ]
            : []),
        getSetDataInstruction({
            ...input,
            metadata: input.metadata.address,
            buffer: input.buffer,
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
        ...(sizeDifference < 0
            ? [
                  getTrimInstruction({
                      account: input.metadata.address,
                      authority: input.authority,
                      destination: input.payer.address,
                      program: input.program,
                      programData: input.programData,
                  }),
              ]
            : []),
    ]);
}

async function getExtraRent(client: ClientWithGetMinimumBalance, sizeDifference: bigint): Promise<Lamports> {
    if (sizeDifference <= 0) return lamports(0n);
    return await client.getMinimumBalance(Number(sizeDifference), { withoutHeader: true });
}
