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
import { TransactionPlanExecutor } from './transactionPlanExecutor';

type TransactionPlanExecutorFactoryTransformer = (
  transactionPlan: TransactionPlan,
  next: (transactionPlan: TransactionPlan) => Promise<TransactionPlanResult>
) => Promise<TransactionPlanResult>;

export type TransactionPlanExecutorFactoryConfig = {
  transformer?: TransactionPlanExecutorFactoryTransformer;
};

export type TransactionPlanExecutorFactory<
  TContext extends object | null = null,
> = (
  config?: TransactionPlanExecutorFactoryConfig
) => TransactionPlanExecutor<TContext>;

export function createBaseTransactionPlanExecutorFactory(
  sendAndConfirm: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<Transaction>
): TransactionPlanExecutorFactory {
  return (config) => {
    const wrapInTransformer: TransactionPlanExecutorFactoryTransformer = (
      transactionPlan,
      next
    ) => {
      if (config?.transformer) {
        return config.transformer(transactionPlan, next);
      }
      return next(transactionPlan);
    };

    return async (plan): Promise<TransactionPlanResult> => {
      const context: TraverseContext = { sendAndConfirm, wrapInTransformer };
      return await traverse(plan, context);
    };
  };
}

type TraverseContext = {
  sendAndConfirm: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<Transaction>;
  wrapInTransformer: TransactionPlanExecutorFactoryTransformer;
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

  // TODO: Handle chunking via decorators.

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
