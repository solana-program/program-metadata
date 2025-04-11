import {
  GetLatestBlockhashApi,
  Rpc,
  setTransactionMessageLifetimeUsingBlockhash,
  SimulateTransactionApi,
} from '@solana/kit';
import { estimateAndUpdateProvisorySetComputeUnitLimitInstruction } from './computeBudgetHelpers';
import { getTimedCacheFunction } from './internal';
import { TransactionPlanExecutorSendAndConfirm } from './transactionPlanExecutorBase';

export function estimateAndUpdateComputeUnitLimitForTransactionPlanExecutor(
  rpc: Rpc<SimulateTransactionApi>,
  sendAndConfirm: TransactionPlanExecutorSendAndConfirm
): TransactionPlanExecutorSendAndConfirm {
  return async (transactionMessage) => {
    return await sendAndConfirm(
      await estimateAndUpdateProvisorySetComputeUnitLimitInstruction(
        rpc,
        transactionMessage
      )
    );
  };
}

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
  };
}
