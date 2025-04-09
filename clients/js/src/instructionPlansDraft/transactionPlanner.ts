import { InstructionPlan } from './instructionPlan';
import { TransactionPlan } from './transactionPlan';

export type TransactionPlanner = (
  instructionPlan: InstructionPlan,
  config?: { abortSignal?: AbortSignal } // TODO: Use
) => Promise<TransactionPlan>;
