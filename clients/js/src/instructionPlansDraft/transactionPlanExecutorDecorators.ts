import {
  GetLatestBlockhashApi,
  Rpc,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { getTimedCacheFunction, Mutable } from './internal';
import { SingleTransactionPlan } from './transactionPlan';
import { TransactionPlanExecutor } from './transactionPlanExecutor';

// TODO: implement
// - Chunk parallel transactions (Needs special transformer)
// - Add support for custom <TContext>

export function refreshBlockhashForTransactionPlanExecutor(
  rpc: Rpc<GetLatestBlockhashApi>,
  executor: TransactionPlanExecutor
): TransactionPlanExecutor {
  // Cache the latest blockhash for 60 seconds.
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);

  return async (transactionPlan) => {
    if (transactionPlan.kind !== 'single') {
      return await executor(transactionPlan);
    }

    (transactionPlan as Mutable<SingleTransactionPlan>).message =
      setTransactionMessageLifetimeUsingBlockhash(
        await getBlockhash(),
        transactionPlan.message
      );
    return await executor(transactionPlan);
  };
}

export function retryTransactionPlanExecutor(
  maxRetries: number,
  executor: TransactionPlanExecutor
): TransactionPlanExecutor {
  return async (transactionPlan) => {
    if (transactionPlan.kind !== 'single') {
      return await executor(transactionPlan);
    }

    let retries = 0;
    let lastError: Error | null = null;

    // x retries means x+1 attempts.
    while (retries < maxRetries + 1) {
      try {
        return await executor(transactionPlan);
      } catch (error) {
        // TODO: Should we not retry on certain error codes?
        retries++;
        lastError = error as Error;
      }
    }

    throw lastError;
  };
}
