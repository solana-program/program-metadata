import { Address, ClientWithTransactionPlanning, HasAddress, InstructionPlan } from '@solana/kit';

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
