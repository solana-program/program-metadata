import { ClientWithTransactionPlanning, InstructionPlan } from '@solana/kit';

export const REALLOC_LIMIT = 10_240;

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
