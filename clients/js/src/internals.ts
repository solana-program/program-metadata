import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
    Account,
    Address,
    assertAccountExists,
    ClientWithTransactionPlanning,
    fetchEncodedAccounts,
    GetMultipleAccountsApi,
    HasAddress,
    InstructionPlan,
    MaybeAccount,
    MaybeEncodedAccount,
    Rpc,
} from '@solana/kit';

import {
    AccountDiscriminator,
    Buffer,
    decodeBuffer,
    decodeMetadata,
    Metadata,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';

/**
 * Fetches the account at a metadata PDA and, optionally, a source buffer
 * account using a single `getMultipleAccounts` RPC call.
 *
 * The metadata account is returned encoded so callers can decode it according
 * to the operation, e.g. via {@link decodeMaybeMetadataOrBuffer}. The buffer
 * account, when requested, must exist and is decoded as a {@link Buffer}.
 */
export async function fetchMetadataAndBuffer(
    rpc: Rpc<GetMultipleAccountsApi>,
    metadata: Address,
    buffer?: Address | HasAddress,
): Promise<[MaybeEncodedAccount, Account<Buffer> | undefined]> {
    const addresses = buffer ? [metadata, toAddress(buffer)] : [metadata];
    const [metadataAccount, bufferAccount] = await fetchEncodedAccounts(rpc, addresses);
    if (!bufferAccount) return [metadataAccount, undefined];
    assertAccountExists(bufferAccount);
    return [metadataAccount, decodeBuffer(bufferAccount)];
}

/**
 * Decodes the account at a metadata PDA according to its discriminator.
 *
 * Besides an initialized metadata account, the PDA may hold a pre-allocated
 * buffer — the remnant of a create that was interrupted before its final
 * `initialize` instruction — which is returned as a decoded {@link Buffer}
 * account so callers can resume the create.
 *
 * A system-owned account without data — i.e. a PDA that was only funded — is
 * reported as missing with its lamports, since the create flow supports
 * pre-funded accounts.
 *
 * @throws If the account is owned by another program or holds an unexpected
 * discriminator.
 */
export function decodeMaybeMetadataOrBuffer(
    account: MaybeEncodedAccount,
): (MaybeAccount<Metadata> & { lamports?: bigint }) | (MaybeAccount<Buffer> & { exists: true }) {
    if (!account.exists) return account;
    if (account.data.length === 0 && account.programAddress === SYSTEM_PROGRAM_ADDRESS) {
        return { address: account.address, exists: false, lamports: account.lamports };
    }
    if (account.programAddress !== PROGRAM_METADATA_PROGRAM_ADDRESS) {
        throw new Error(
            `The account at ${account.address} is owned by ${account.programAddress}; ` +
                `expected a metadata account owned by ${PROGRAM_METADATA_PROGRAM_ADDRESS}.`,
        );
    }
    switch (account.data[0]) {
        case AccountDiscriminator.Metadata:
            return decodeMetadata(account as MaybeEncodedAccount);
        case AccountDiscriminator.Buffer:
            return decodeBuffer(account as MaybeEncodedAccount) as MaybeAccount<Buffer> & { exists: true };
        default:
            throw new Error(
                `The account at ${account.address} has an unexpected discriminator (${account.data[0]}); ` +
                    'expected a metadata account or a pre-allocated buffer.',
            );
    }
}

/**
 * Returns `true` if the given instruction plan can be planned by the client's
 * transaction planner without throwing — i.e. it fits within a single
 * transaction subject to the planner's compute and size limits.
 */
export async function isValidInstructionPlan(instructionPlan: InstructionPlan, client: ClientWithTransactionPlanning) {
    try {
        await client.planTransaction(instructionPlan);
        return true;
    } catch {
        return false;
    }
}

/**
 * Unwraps an address input that may be either a plain {@link Address} or an
 * address-bearing object (see {@link HasAddress}) into a plain {@link Address}.
 */
export function toAddress<TAddress extends string>(input: Address<TAddress> | HasAddress<TAddress>): Address<TAddress> {
    return typeof input === 'string' ? input : input.address;
}

/**
 * Resolves the destination of a `close` instruction from a `closeBuffer`-style
 * option. An explicit address (or address-bearing object) is used as-is, whereas
 * `true` falls back to the provided default destination.
 */
export function getCloseDestination(closeBuffer: Address | HasAddress | true, fallback: Address): Address {
    return closeBuffer === true ? fallback : toAddress(closeBuffer);
}

/**
 * Returns the discriminator of a decoded metadata or buffer account, or
 * `undefined` if the input is not an existing decoded account — e.g. an
 * address or a missing `MaybeAccount`.
 *
 * Both account types share the same header layout, so accounts decoded with
 * either decoder are supported.
 */
export function getDecodedAccountDiscriminator(input: unknown): AccountDiscriminator | undefined {
    if (typeof input !== 'object' || input === null || !('data' in input) || !('lamports' in input)) {
        return undefined;
    }
    const { data } = input as { data: unknown };
    if (typeof data !== 'object' || data === null || !('discriminator' in data)) {
        return undefined;
    }
    return (data as { discriminator: AccountDiscriminator }).discriminator;
}

/**
 * Returns `true` if the given input is a decoded account holding a
 * pre-allocated buffer, e.g. a metadata PDA left behind by an interrupted
 * create.
 */
export function isPreAllocatedBuffer(input: unknown): input is Account<Buffer> {
    return getDecodedAccountDiscriminator(input) === AccountDiscriminator.Buffer;
}

/**
 * Returns `true` if the given input is a decoded, initialized metadata
 * account.
 */
export function isInitializedMetadata(input: unknown): input is Account<Metadata> {
    return getDecodedAccountDiscriminator(input) === AccountDiscriminator.Metadata;
}
