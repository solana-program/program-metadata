import { InstructionPlan } from './instructionPlan';
import { TransactionPlan } from './transactionPlan';

export type TransactionPlanner = (
  instructionPlan: InstructionPlan
) => Promise<TransactionPlan>;

export function getDefaultTransactionPlanner(): TransactionPlanner {
  // TODO: Implement
  // - Ask for additional instructions for each message. Maybe `getDefaultMessage` or `messageModifier` functions?
  // - Add Compute Unit instructions.
  // - Split instruction by sizes.
  // - Provide remaining bytes to dynamic instructions.
  // - Pack transaction messages as much as possible.
  // - simulate CU.
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return {
      kind: 'static',
      message: { version: 0, instructions: [] },
    };
  };
}
