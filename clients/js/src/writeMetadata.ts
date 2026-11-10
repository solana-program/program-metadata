import {
    Account,
    Address,
    ClientWithGetMinimumBalance,
    ClientWithRpc,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    GetMultipleAccountsApi,
    HasAddress,
    InstructionPlan,
    MaybeAccount,
    ReadonlyUint8Array,
    TransactionPlanResult,
    TransactionSigner,
} from '@solana/kit';

import { getCreateMetadataInstructionPlan } from './createMetadata';
import { Buffer, InitializeInput, Metadata, SetDataInput } from './generated';
import { decodeMaybeMetadataOrBuffer, fetchMetadataAndBuffer, isInitializedMetadata } from './internals';
import { getUpdateMetadataInstructionPlan } from './updateMetadata';
import { MetadataInput, resolveMetadataPda } from './utils';

type WriteMetadataClient = ClientWithGetMinimumBalance &
    ClientWithRpc<GetMultipleAccountsApi> &
    ClientWithTransactionPlanning &
    ClientWithTransactionSending;

/**
 * Creates or updates a metadata account.
 *
 * When `input.metadata` is omitted, the PDA is derived from `program`, `seed`
 * and — for non-canonical metadata accounts — `authority`. The metadata
 * account is fetched to determine whether it already exists; if so, the
 * operation is an update, otherwise it is a create. A pre-allocated buffer at
 * the metadata PDA — the remnant of an interrupted create — resumes the
 * create instead. When `input.buffer` is provided as an address, the buffer
 * account is fetched alongside it to determine its data length.
 */
export async function writeMetadata(client: WriteMetadataClient, input: MetadataInput): Promise<TransactionPlanResult> {
    const metadata = await resolveMetadataPda(input);
    const [metadataAccount, buffer] = await fetchMetadataAndBuffer(client.rpc, metadata, input.buffer);
    const plan = await getWriteMetadataInstructionPlan(client, {
        ...input,
        metadata: decodeMaybeMetadataOrBuffer(metadataAccount),
        buffer,
    });
    return await client.sendTransactions(plan);
}

/**
 * Builds a plan that creates or updates a metadata account depending on the
 * state of `input.metadata`:
 *
 * - a missing account is created,
 * - a pre-allocated buffer — the remnant of a create interrupted before its
 *   final `initialize` instruction — resumes that create,
 * - an initialized metadata account is updated.
 */
export async function getWriteMetadataInstructionPlan(
    client: ClientWithGetMinimumBalance & ClientWithTransactionPlanning,
    input: Omit<InitializeInput, 'data' | 'metadata'> &
        Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
            buffer?: Account<Buffer>;
            closeBuffer?: Address | HasAddress | boolean;
            data?: ReadonlyUint8Array;
            metadata: Account<Buffer> | MaybeAccount<Metadata>;
            payer: TransactionSigner;
            singleExtendPerTransaction?: boolean;
        },
): Promise<InstructionPlan> {
    const { metadata } = input;
    if (!isInitializedMetadata(metadata)) {
        return await getCreateMetadataInstructionPlan(client, { ...input, metadata });
    }
    return await getUpdateMetadataInstructionPlan(client, { ...input, metadata });
}
