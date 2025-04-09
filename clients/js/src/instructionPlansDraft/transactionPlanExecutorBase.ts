import {
  CompilableTransactionMessage,
  SolanaError,
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

export type TransactionPlanExecutorSendAndConfirm = <
  TTransactionMessage extends CompilableTransactionMessage,
  TContext extends object = object,
>(
  transactionMessage: TTransactionMessage
) => Promise<{ context?: TContext; transaction: Transaction }>;

export function createBaseTransactionPlanExecutor(
  sendAndConfirm: TransactionPlanExecutorSendAndConfirm
): TransactionPlanExecutor {
  return async (plan): Promise<TransactionPlanResult> => {
    const context: TraverseContext = { sendAndConfirm };
    return await traverse(plan, context); // TODO: Throw error unless everything is successful.
  };
}

type TraverseContext = {
  sendAndConfirm: TransactionPlanExecutorSendAndConfirm;
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

  // TODO: Handle chunking.

  return { kind: 'parallel', plans: results };
}

async function traverseSingle(
  transactionPlan: SingleTransactionPlan,
  traverseContext: TraverseContext
): Promise<TransactionPlanResult> {
  try {
    const result = await traverseContext.sendAndConfirm(
      transactionPlan.message
    );

    // TODO: Handle error.

    return {
      kind: 'single',
      message: transactionPlan.message,
      status: {
        kind: 'success',
        transaction: result.transaction,
        context: result.context ?? {},
      },
    };
  } catch (error) {
    return {
      kind: 'single',
      message: transactionPlan.message,
      status: { kind: 'error', error: error as SolanaError },
    };
  }
}
