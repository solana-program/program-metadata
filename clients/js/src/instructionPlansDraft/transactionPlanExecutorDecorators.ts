import {
  GetLatestBlockhashApi,
  Rpc,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { getTimedCacheFunction } from './internal';
import { TransactionPlanExecutorSendAndConfirm } from './transactionPlanExecutorBase';

// TODO: implement
// - Chunk parallel transactions (Needs special transformer)
// - Add support for custom <TContext>

export function refreshBlockhashForTransactionPlanExecutor(
  rpc: Rpc<GetLatestBlockhashApi>,
  sendAndConfirm: TransactionPlanExecutorSendAndConfirm
): TransactionPlanExecutorSendAndConfirm {
  // Cache the latest blockhash for 60 seconds.
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);

  return async (transactionMessage) => {
    return await sendAndConfirm(
      setTransactionMessageLifetimeUsingBlockhash(
        await getBlockhash(),
        transactionMessage
      )
    );
  };
}

export function retryTransactionPlanExecutor(
  maxRetries: number,
  sendAndConfirm: TransactionPlanExecutorSendAndConfirm
): TransactionPlanExecutorSendAndConfirm {
  return async (transactionMessage) => {
    let retries = 0;
    let lastError: Error | null = null;

    // x retries means x+1 attempts.
    while (retries < maxRetries + 1) {
      try {
        return await sendAndConfirm(transactionMessage);
      } catch (error) {
        // TODO: Should we not retry on certain error codes?
        retries++;
        lastError = error as Error;
      }
    }

    throw lastError;
    // TODO: Catch and return failed results instead of failing.
    // TODO: Fail whilst returning the result in the context at the very end.
  };
}
