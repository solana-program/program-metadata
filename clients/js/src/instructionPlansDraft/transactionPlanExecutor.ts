import {
  GetLatestBlockhashApi,
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

export function createBaseTransactionPlanExecutor(options: {
  rpc: Rpc<GetLatestBlockhashApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}): TransactionPlanExecutor {
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

  return executor;
}
