import { InstructionPlan } from './instructionPlan';
import { TransactionPlan } from './transactionPlan';

export type TransactionPlanner = (
  instructionPlan: InstructionPlan,
  config?: { abortSignal?: AbortSignal }
) => Promise<TransactionPlan>;

export async function isValidInstructionPlan(
  instructionPlan: InstructionPlan,
  planner: TransactionPlanner
) {
  try {
    await planner(instructionPlan);
    return true;
  } catch {
    return false;
  }
}
