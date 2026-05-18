import {
    Account,
    Address,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    GetAccountInfoApi,
    InstructionPlan,
    MaybeAccount,
    ReadonlyUint8Array,
    TransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';

import { getCreateMetadataInstructionPlan } from './createMetadata';
import { Buffer, fetchBuffer, fetchMaybeMetadata, InitializeInput, Metadata, SetDataInput } from './generated';
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
            closeBuffer?: Address | boolean;
            data?: ReadonlyUint8Array;
            metadata: MaybeAccount<Metadata>;
            payer: TransactionSigner;
        },
): Promise<InstructionPlan> {
    return input.metadata.exists
        ? await getUpdateMetadataInstructionPlan(client, { ...input, metadata: input.metadata })
        : await getCreateMetadataInstructionPlan(client, { ...input, metadata: input.metadata.address });
}
