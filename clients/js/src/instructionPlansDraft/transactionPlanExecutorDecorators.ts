import {
  Blockhash,
  GetLatestBlockhashApi,
  isSolanaError,
  Rpc,
  setTransactionMessageLifetimeUsingBlockhash,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
} from '@solana/kit';
import { SingleTransactionPlan } from './transactionPlan';
import { TransactionPlanExecutor } from './transactionPlanExecutor';

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

// TODO: implement
// - Chunk parallel transactions
// - Add support for curstom <TContext>
// - Handle cancellation (i.e. don't continue past a failing sequential plan)

export function refreshBlockheightTransactionPlanExecutor(
  rpc: Rpc<GetLatestBlockhashApi>,
  executor: TransactionPlanExecutor
): TransactionPlanExecutor {
  let latestBlockhash: {
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  } | null = null;
  return async function traverse(transactionPlan) {
    if (transactionPlan.kind !== 'single') {
      return await executor(transactionPlan);
    }

    // Replace the blockhash in the message, if a new one is available.
    if (latestBlockhash) {
      (transactionPlan as Mutable<SingleTransactionPlan>).message =
        setTransactionMessageLifetimeUsingBlockhash(
          latestBlockhash,
          transactionPlan.message
        );
    }

    try {
      return await executor(transactionPlan);
    } catch (error) {
      if (
        isSolanaError(
          error,
          // TODO: Retry on blockhash expired error.
          SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND
        )
      ) {
        const result = await rpc.getLatestBlockhash().send();
        latestBlockhash = result.value;
        return await traverse(transactionPlan);
      } else {
        throw error;
      }
    }
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
