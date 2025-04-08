import { InstructionPlan } from './instructionPlan';
import { TransactionPlan } from './transactionPlan';

export type TransactionPlanner = (
  instructionPlan: InstructionPlan
) => Promise<TransactionPlan>;
