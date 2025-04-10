import { TransactionPlan } from './transactionPlan';
import { TransactionPlanResult } from './transactionPlanResult';

export type TransactionPlanExecutor<TContext extends object = object> = (
  transactionPlan: TransactionPlan,
  config?: { abortSignal?: AbortSignal }
) => Promise<TransactionPlanResult<TContext>>;
