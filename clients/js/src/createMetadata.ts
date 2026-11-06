import { getTransferSolInstruction } from '@solana-program/system';
import {
    Account,
    Address,
    bytesEqual,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    GetMultipleAccountsApi,
    HasAddress,
    InstructionPlan,
    MaybeAccount,
    parallelInstructionPlan,
    ReadonlyUint8Array,
    sequentialInstructionPlan,
    TransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';
import { getAddressFromResolvedInstructionAccount } from '@solana/kit/program-client-core';

import {
    AccountDiscriminator,
    Buffer,
    getAllocateInstruction,
    getCloseInstruction,
    getInitializeInstruction,
    getWriteInstruction,
    InitializeInput,
    Metadata,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
    decodeMaybeMetadataOrBuffer,
    fetchMetadataAndBuffer,
    getCloseDestination,
    getDecodedAccountDiscriminator,
    isValidInstructionPlan,
} from './internals';
import {
    ACCOUNT_HEADER_LENGTH,
    getAccountSize,
    getExtendInstructionPlan,
    getWriteInstructionPlan,
    MetadataInput,
    REALLOC_LIMIT,
    resolveMetadataPda,
} from './utils';

type CreateMetadataClient = ClientWithGetMinimumBalance &
    ClientWithRpc<GetMultipleAccountsApi> &
    ClientWithTransactionPlanning &
    ClientWithTransactionSending;

/**
 * The metadata account to create. Either its address or the account fetched
 * at that address — see {@link decodeMaybeMetadataOrBuffer}.
 *
 * Providing the fetched account allows the create to resume from a
 * pre-allocated buffer left at the metadata PDA by an interrupted create.
 */
export type CreateMetadataTarget = Account<Buffer> | InitializeInput['metadata'] | MaybeAccount<Metadata>;

/**
 * Creates a new metadata account for the given program.
 *
 * When `input.metadata` is omitted, the PDA is derived from `program`, `seed`
 * and — for non-canonical metadata accounts — `authority`. The metadata
 * account is fetched so that a pre-allocated buffer left at the PDA by an
 * interrupted create is resumed rather than allocated again. When
 * `input.buffer` is provided as an address, the buffer account is fetched
 * alongside it to determine its data length.
 *
 * @throws If the metadata account already exists.
 */
export async function createMetadata(
    client: CreateMetadataClient,
    input: MetadataInput,
): Promise<TransactionPlanResult> {
    const metadata = await resolveMetadataPda(input);
    const [metadataAccount, buffer] = await fetchMetadataAndBuffer(client.rpc, metadata, input.buffer);
    const plan = await getCreateMetadataInstructionPlan(client, {
        ...input,
        buffer,
        metadata: decodeMaybeMetadataOrBuffer(metadataAccount),
    });
    return await client.sendTransactions(plan);
}

/**
 * Builds a plan that creates a new metadata account.
 *
 * When `input.metadata` is the account fetched at the metadata PDA and holds a
 * pre-allocated buffer — the remnant of a create interrupted before its final
 * `initialize` instruction — only the missing steps of the create are planned.
 *
 * @throws If `input.metadata` is an existing metadata account.
 */
export async function getCreateMetadataInstructionPlan(
    client: ClientWithGetMinimumBalance & ClientWithTransactionPlanning,
    input: Omit<InitializeInput, 'data' | 'metadata'> & {
        buffer?: Account<Buffer>;
        data?: ReadonlyUint8Array;
        metadata: CreateMetadataTarget;
        payer: TransactionSigner;
        closeBuffer?: Address | HasAddress | boolean;
        singleExtendPerTransaction?: boolean;
    },
): Promise<InstructionPlan> {
    if (!input.buffer && !input.data) {
        throw new Error('Either `buffer` or `data` must be provided to create a new metadata account.');
    }
    const pda = getMetadataPdaState(input.metadata);

    if (input.buffer) {
        return await getCreateMetadataInstructionPlanUsingExistingBuffer(client, {
            ...input,
            buffer: input.buffer.address,
            dataLength: input.buffer.data.data.length,
            sourceData: input.buffer.data.data,
        });
    }

    const data = input.data as ReadonlyUint8Array;
    if (pda.allocated) {
        return await getCreateMetadataInstructionPlanUsingNewBuffer(client, { ...input, data });
    }

    const usingInstructionDataPlan = await getCreateMetadataInstructionPlanUsingInstructionData(client, {
        ...input,
        metadata: pda.address,
        data,
        existingLamports: pda.lamports,
    });
    const validPlan = await isValidInstructionPlan(usingInstructionDataPlan, client);
    return validPlan
        ? usingInstructionDataPlan
        : await getCreateMetadataInstructionPlanUsingNewBuffer(client, { ...input, data });
}

export async function getCreateMetadataInstructionPlanUsingInstructionData(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data'> & {
        existingLamports?: bigint;
        data?: ReadonlyUint8Array;
        payer: TransactionSigner;
    },
) {
    const dataLength = input.data?.length ?? 0;
    const rent = await client.getMinimumBalance(Number(getAccountSize(dataLength)));
    const missingRent = rent - (input.existingLamports ?? 0n);
    return sequentialInstructionPlan([
        ...(missingRent > 0n
            ? [
                  getTransferSolInstruction({
                      source: input.payer,
                      destination: input.metadata,
                      amount: missingRent,
                  }),
              ]
            : []),
        getInitializeInstruction(input),
    ]);
}

/**
 * Builds a plan that allocates the metadata PDA as a buffer, writes `data`
 * into it in chunks and initializes it as a metadata account.
 *
 * When `input.metadata` holds a pre-allocated buffer, the allocation is
 * skipped and so is the write if the buffer already holds `data`.
 */
export async function getCreateMetadataInstructionPlanUsingNewBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data' | 'metadata'> & {
        data: ReadonlyUint8Array;
        metadata: CreateMetadataTarget;
        payer: TransactionSigner;
        singleExtendPerTransaction?: boolean;
    },
) {
    const pda = getMetadataPdaState(input.metadata);
    return await getCreateMetadataInstructionPlanUsingPdaBuffer(client, {
        ...input,
        pda,
        dataLength: input.data.length,
        write:
            pda.allocated && bytesEqual(pda.data, input.data)
                ? undefined
                : parallelInstructionPlan([
                      getWriteInstructionPlan({ buffer: pda.address, authority: input.authority, data: input.data }),
                  ]),
    });
}

/**
 * Builds a plan that allocates the metadata PDA as a buffer, copies the data
 * of an existing `buffer` into it and initializes it as a metadata account,
 * optionally closing `buffer` afterwards.
 *
 * When `input.metadata` holds a pre-allocated buffer, the allocation is
 * skipped and so is the write if the buffer already holds `sourceData`.
 */
export async function getCreateMetadataInstructionPlanUsingExistingBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data' | 'metadata'> & {
        buffer: Address | HasAddress;
        dataLength: number;
        metadata: CreateMetadataTarget;
        payer: TransactionSigner;
        closeBuffer?: Address | HasAddress | boolean;
        singleExtendPerTransaction?: boolean;
        sourceData?: ReadonlyUint8Array;
    },
) {
    const pda = getMetadataPdaState(input.metadata);
    const buffer = getAddressFromResolvedInstructionAccount('buffer', input.buffer);
    if (buffer === pda.address) {
        throw new Error('`buffer` must not be the metadata account itself.');
    }
    return await getCreateMetadataInstructionPlanUsingPdaBuffer(client, {
        ...input,
        pda,
        write:
            input.sourceData && pda.allocated && bytesEqual(pda.data, input.sourceData)
                ? undefined
                : getWriteInstruction({
                      buffer: pda.address,
                      authority: input.authority,
                      sourceBuffer: buffer,
                      offset: 0,
                  }),
        close: input.closeBuffer
            ? getCloseInstruction({
                  account: buffer,
                  authority: input.authority,
                  destination: getCloseDestination(input.closeBuffer, input.payer.address),
              })
            : undefined,
    });
}

/**
 * The state of the metadata PDA before creating the metadata account: either
 * not allocated yet or holding a pre-allocated buffer.
 */
type MetadataPdaState = {
    address: Address;
    allocated: boolean;
    data: ReadonlyUint8Array;
    lamports: bigint;
};

function getMetadataPdaState(metadata: CreateMetadataTarget): MetadataPdaState {
    const discriminator = getDecodedAccountDiscriminator(metadata);
    if (discriminator === undefined) {
        const address = getAddressFromResolvedInstructionAccount('metadata', metadata as InitializeInput['metadata']);
        const lamports = typeof metadata === 'object' && 'lamports' in metadata ? (metadata.lamports ?? 0n) : 0n;
        return { address, allocated: false, data: new Uint8Array(0), lamports };
    }
    const account = metadata as Account<Buffer>;
    switch (discriminator) {
        case AccountDiscriminator.Buffer:
            return { address: account.address, allocated: true, data: account.data.data, lamports: account.lamports };
        case AccountDiscriminator.Metadata:
            throw new Error(`Metadata account ${account.address} already exists.`);
        default:
            throw new Error(
                `The account at ${account.address} has an unexpected discriminator (${discriminator}); ` +
                    'expected a metadata account or a pre-allocated buffer.',
            );
    }
}

/**
 * Shared steps of the buffer-based create flows. When the metadata PDA holds
 * a pre-allocated buffer, each step that an interrupted create already
 * completed is skipped: rent the account holds is not transferred again, the
 * account is not allocated again and it is only extended by the growth left.
 */
async function getCreateMetadataInstructionPlanUsingPdaBuffer(
    client: ClientWithGetMinimumBalance,
    input: Omit<InitializeInput, 'data' | 'metadata'> & {
        close?: ReturnType<typeof getCloseInstruction>;
        dataLength: number;
        payer: TransactionSigner;
        pda: MetadataPdaState;
        singleExtendPerTransaction?: boolean;
        write?: InstructionPlan | ReturnType<typeof getWriteInstruction>;
    },
) {
    const { pda } = input;

    // Buffer accounts cannot shrink and `initialize` derives the data length
    // from the account size.
    if (input.dataLength < pda.data.length) {
        throw new Error(
            `The metadata account at ${pda.address} holds a pre-allocated buffer of ${pda.data.length} ` +
                `bytes which is larger than the ${input.dataLength} bytes to store, and buffer accounts cannot be ` +
                `trimmed. Close it (eg. \`close-buffer ${pda.address}\`) and retry to create the metadata ` +
                `account from scratch.`,
        );
    }

    const requiredRent = await client.getMinimumBalance(Number(getAccountSize(input.dataLength)));
    const missingRent = requiredRent - pda.lamports;
    const extraLength = input.dataLength - pda.data.length;
    // The header allocated by `allocate` counts towards the realloc limit of
    // the transaction too, see `needsExtend`.
    const growth = (pda.allocated ? 0 : ACCOUNT_HEADER_LENGTH) + extraLength;

    return sequentialInstructionPlan([
        ...(missingRent > 0n
            ? [getTransferSolInstruction({ source: input.payer, destination: pda.address, amount: missingRent })]
            : []),
        ...(pda.allocated
            ? []
            : [
                  getAllocateInstruction({
                      buffer: pda.address,
                      authority: input.authority,
                      program: input.program,
                      programData: input.programData,
                      seed: input.seed,
                  }),
              ]),
        ...(growth > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: pda.address,
                      authority: input.authority,
                      extraLength,
                      program: input.program,
                      programData: input.programData,
                      singleExtendPerTransaction: input.singleExtendPerTransaction,
                  }),
              ]
            : []),
        ...(input.write ? [input.write] : []),
        getInitializeInstruction({
            ...input,
            metadata: pda.address,
            system: PROGRAM_METADATA_PROGRAM_ADDRESS,
            data: undefined,
        }),
        ...(input.close ? [input.close] : []),
    ]);
}
