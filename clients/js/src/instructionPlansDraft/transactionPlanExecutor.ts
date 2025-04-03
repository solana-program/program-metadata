import {
  Blockhash,
  GetLatestBlockhashApi,
  isSolanaError,
  pipe,
  Rpc,
  RpcSubscriptions,
  Signature,
  SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import { SingleTransactionPlan, TransactionPlan } from './transactionPlan';
import { TransactionPlanResult } from './transactionPlanResult';

export type TransactionPlanExecutor<TContext extends object | null = null> = (
  transactionPlan: TransactionPlan
) => Promise<TransactionPlanResult<TContext>>;

export function getDefaultTransactionPlanExecutor(options: {
  rpc: Rpc<GetLatestBlockhashApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>; // TODO: narrow
}): TransactionPlanExecutor {
  const { rpc } = options;

  // TODO: implement
  // - Refetch blockhash if it's expired
  // - Retry on failure
  // - Chunk parallel transactions
  // - Handle cancellation (i.e. don't continue past a failing sequential plan)

  const executor: TransactionPlanExecutor = async (plan) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      context: null,
      kind: 'single',
      message: (plan as SingleTransactionPlan).message,
      signature: 'signature' as Signature,
      status: { kind: 'success' },
    };
  };

  return pipe(
    executor,
    (ex) => refreshBlockheightTransactionPlanExecutor(rpc, ex),
    (ex) => retryTransactionPlanExecutor(5, ex)
  );
}

export function refreshBlockheightTransactionPlanExecutor(
  rpc: Rpc<GetLatestBlockhashApi>,
  executor: TransactionPlanExecutor
): TransactionPlanExecutor {
  let latestBlockhash: {
    blockhash: Blockhash;
    lastValidBlockHeight: bigint;
  } | null = null;
  return async (transactionPlan) => {
    if (transactionPlan.kind !== 'single') {
      return await executor(transactionPlan);
    }

    if (latestBlockhash) {
      // Replace the blockhash in the message
    }
    try {
      return await executor(transactionPlan);
    } catch (error) {
      if (isSolanaError(error)) {
        // TODO: Retry on blockhash expired error
        const result = await rpc.getLatestBlockhash().send();
        latestBlockhash = result.value;
        return await executor(transactionPlan);
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

    while (retries < maxRetries) {
      try {
        return await executor(transactionPlan);
      } catch (error) {
        retries++;
        lastError = error as Error;
      }
    }

    throw lastError;
  };
}
