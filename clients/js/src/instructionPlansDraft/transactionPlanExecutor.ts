import {
  BaseTransactionMessage,
  getSignatureFromTransaction,
  Transaction,
} from '@solana/kit';
import {
  ParallelTransactionPlan,
  SequentialTransactionPlan,
  SingleTransactionPlan,
  TransactionPlan,
} from './transactionPlan';
import { TransactionPlanResult } from './transactionPlanResult';

export type TransactionPlanExecutor<TContext extends object | null = null> = (
  transactionPlan: TransactionPlan
) => Promise<TransactionPlanResult<TContext>>;

export function createBaseTransactionPlanExecutor(
  sendAndConfirm: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<Transaction>
): TransactionPlanExecutor {
  return async (plan): Promise<TransactionPlanResult> => {
    const context: TraverseContext = { sendAndConfirm };
    return await traverse(plan, context);
  };
}

type TraverseContext = {
  sendAndConfirm: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<Transaction>;
};

async function traverse(
  transactionPlan: TransactionPlan,
  context: TraverseContext
): Promise<TransactionPlanResult> {
  switch (transactionPlan.kind) {
    case 'sequential':
      return await traverseSequential(transactionPlan, context);
    case 'parallel':
      return await traverseParallel(transactionPlan, context);
    case 'single':
      return await traverseSingle(transactionPlan, context);
    default:
      transactionPlan satisfies never;
      throw new Error(
        `Unknown instruction plan kind: ${(transactionPlan as { kind: string }).kind}`
      );
  }
}

async function traverseSequential(
  transactionPlan: SequentialTransactionPlan,
  context: TraverseContext
): Promise<TransactionPlanResult> {
  const results: TransactionPlanResult[] = [];
  for (const subPlan of transactionPlan.plans) {
    const result = await traverse(subPlan, context);
    results.push(result);

    // TODO: Handle cancellations.
  }
  return { kind: 'sequential', plans: results };
}

async function traverseParallel(
  transactionPlan: ParallelTransactionPlan,
  context: TraverseContext
): Promise<TransactionPlanResult> {
  const results = await Promise.all(
    transactionPlan.plans.map((subPlan) => traverse(subPlan, context))
  );
  return { kind: 'parallel', plans: results };
}

async function traverseSingle(
  transactionPlan: SingleTransactionPlan,
  context: TraverseContext
): Promise<TransactionPlanResult> {
  const transaction = await context.sendAndConfirm(transactionPlan.message);

  // TODO: Handle error.

  return {
    kind: 'single',
    context: null,
    message: transactionPlan.message,
    signature: getSignatureFromTransaction(transaction),
    status: { kind: 'success' },
  };
}
