import {
    Account,
    Address,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    GetAccountInfoApi,
    HasAddress,
    InstructionPlan,
    MaybeAccount,
    ReadonlyUint8Array,
    TransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';

import { getCreateMetadataInstructionPlan, getResumeMetadataInstructionPlan } from './createMetadata';
import {
    AccountDiscriminator,
    Buffer,
    fetchBuffer,
    fetchMaybeMetadata,
    InitializeInput,
    Metadata,
    SetDataInput,
} from './generated';
import { getUpdateMetadataInstructionPlan } from './updateMetadata';
import { MetadataInput, resolveMetadataPda } from './utils';

type WriteMetadataClient = ClientWithGetMinimumBalance &
    ClientWithRpc<GetAccountInfoApi> &
    ClientWithTransactionPlanning &
    ClientWithTransactionSending;

/**
 * Creates or updates a metadata account.
 *
 * When `input.metadata` is omitted, the PDA is derived from `program`, `seed`
 * and — for non-canonical metadata accounts — `authority`. The metadata
 * account is fetched to determine whether it already exists; if so, the
 * operation is an update, otherwise it is a create. When `input.buffer` is
 * provided as an address, the buffer account is fetched to determine its data
 * length.
 */
export async function writeMetadata(client: WriteMetadataClient, input: MetadataInput): Promise<TransactionPlanResult> {
    const metadata = await resolveMetadataPda(input);
    const [metadataAccount, buffer] = await Promise.all([
        fetchMaybeMetadata(client.rpc, metadata),
        input.buffer ? fetchBuffer(client.rpc, input.buffer) : Promise.resolve(undefined),
    ]);
    const plan = await getWriteMetadataInstructionPlan(client, {
        ...input,
        metadata: metadataAccount,
        buffer,
    });
    return await client.sendTransactions(plan);
}

export async function getWriteMetadataInstructionPlan(
    client: ClientWithGetMinimumBalance & ClientWithTransactionPlanning,
    input: Omit<InitializeInput, 'data' | 'metadata'> &
        Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
            buffer?: Account<Buffer>;
            closeBuffer?: Address | HasAddress | boolean;
            data?: ReadonlyUint8Array;
            metadata: MaybeAccount<Metadata>;
            payer: TransactionSigner;
            singleExtendPerTransaction?: boolean;
        },
): Promise<InstructionPlan> {
    if (!input.metadata.exists) {
        return await getCreateMetadataInstructionPlan(client, { ...input, metadata: input.metadata.address });
    }
    switch (input.metadata.data.discriminator) {
        case AccountDiscriminator.Metadata:
            return await getUpdateMetadataInstructionPlan(client, { ...input, metadata: input.metadata });
        // A pre-allocated buffer at the metadata PDA means a previous create
        // was interrupted before initializing the account — resume it instead
        // of updating, which would fail since `set_data` requires an
        // initialized metadata account.
        case AccountDiscriminator.Buffer:
            return await getResumeMetadataInstructionPlan(client, { ...input, metadata: input.metadata });
        default:
            throw new Error(
                `The account at ${input.metadata.address} has an unexpected discriminator ` +
                    `(${input.metadata.data.discriminator}); expected a metadata account or a pre-allocated buffer.`,
            );
    }
}
