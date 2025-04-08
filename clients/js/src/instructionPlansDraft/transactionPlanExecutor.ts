import { TransactionPlan } from './transactionPlan';
import { TransactionPlanResult } from './transactionPlanResult';

export type TransactionPlanExecutor<TContext extends object | null = null> = (
  transactionPlan: TransactionPlan
) => Promise<TransactionPlanResult<TContext>>;
