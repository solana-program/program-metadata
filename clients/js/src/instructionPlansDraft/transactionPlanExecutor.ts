import { TransactionPlan } from './transactionPlan';
import { TransactionPlanResult } from './transactionPlanResult';

export type TransactionPlanExecutor<TContext extends object | null = null> = (
  transactionPlan: TransactionPlan,
  config?: { abortSignal?: AbortSignal } // TODO: Use
) => Promise<TransactionPlanResult<TContext>>;
