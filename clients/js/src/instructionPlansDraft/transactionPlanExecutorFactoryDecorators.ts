import {
  GetLatestBlockhashApi,
  Rpc,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { getTimedCacheFunction } from './internal';
import {
  TransactionPlanExecutorFactory,
  TransactionPlanExecutorFactoryConfig,
} from './transactionPlanExecutorFactory';

// TODO: implement
// - Chunk parallel transactions (Needs special transformer)
// - Add support for custom <TContext>

export function transformTransactionPlanExecutorFactory(
  transformer: Required<TransactionPlanExecutorFactoryConfig>['transformer'],
  executorFactory: TransactionPlanExecutorFactory
): TransactionPlanExecutorFactory {
  return (config) => {
    return executorFactory({
      ...config,
      transformer: (transactionPlan, next) => {
        const newNext: typeof next = (plan) => transformer(plan, next);
        return config?.transformer
          ? config.transformer(transactionPlan, newNext)
          : newNext(transactionPlan);
      },
    });
  };
}

export function refreshBlockhashForTransactionPlanExecutor(
  rpc: Rpc<GetLatestBlockhashApi>,
  executorFactory: TransactionPlanExecutorFactory
): TransactionPlanExecutorFactory {
  // Cache the latest blockhash for 60 seconds.
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);

  return transformTransactionPlanExecutorFactory(
    async (transactionPlan, next) => {
      if (transactionPlan.kind !== 'single') {
        return await next(transactionPlan);
      }

      return await next({
        ...transactionPlan,
        message: setTransactionMessageLifetimeUsingBlockhash(
          await getBlockhash(),
          transactionPlan.message
        ),
      });
    },
    executorFactory
  );
}

export function retryTransactionPlanExecutor(
  maxRetries: number,
  executorFactory: TransactionPlanExecutorFactory
): TransactionPlanExecutorFactory {
  return transformTransactionPlanExecutorFactory(
    async (transactionPlan, next) => {
      if (transactionPlan.kind !== 'single') {
        return await next(transactionPlan);
      }

      let retries = 0;
      let lastError: Error | null = null;

      // x retries means x+1 attempts.
      while (retries < maxRetries + 1) {
        try {
          return await next(transactionPlan);
        } catch (error) {
          // TODO: Should we not retry on certain error codes?
          retries++;
          lastError = error as Error;
        }
      }

      throw lastError;
      // TODO: Catch and return failed results instead of failing.
      // TODO: Have another decorator that fails whilst returning the result in the context at the very end.
    },
    executorFactory
  );
}
