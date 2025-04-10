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
  transactionMessage: TTransactionMessage,
  config?: { abortSignal?: AbortSignal }
) => Promise<{ context?: TContext; transaction: Transaction }>;

type TransactionPlanExecutorConfig = {
  parallelChunkSize?: number;
  sendAndConfirm: TransactionPlanExecutorSendAndConfirm;
};

export function createBaseTransactionPlanExecutor(
  executorConfig: TransactionPlanExecutorConfig
): TransactionPlanExecutor {
  return async (plan, config): Promise<TransactionPlanResult> => {
    const context: TraverseContext = {
      ...executorConfig,
      abortSignal: config?.abortSignal,
      canceled: false,
    };

    const cancelHandler = () => (context.canceled = true);
    config?.abortSignal?.addEventListener('abort', cancelHandler);
    const result = await traverse(plan, context);
    config?.abortSignal?.removeEventListener('abort', cancelHandler);

    if (context.canceled) {
      // TODO: Coded error.
      const error = new Error('Transaction plan execution failed') as Error & {
        result: TransactionPlanResult;
      };
      error.result = result;
      throw error;
    }

    return result;
  };
}

type TraverseContext = TransactionPlanExecutorConfig & {
  abortSignal?: AbortSignal;
  canceled: boolean;
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
  }
  return {
    kind: 'sequential',
    divisible: transactionPlan.divisible,
    plans: results,
  };
}

async function traverseParallel(
  transactionPlan: ParallelTransactionPlan,
  context: TraverseContext
): Promise<TransactionPlanResult> {
  const chunks = chunkPlans(transactionPlan.plans, context.parallelChunkSize);
  const results: TransactionPlanResult[] = [];

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map((plan) => traverse(plan, context))
    );
    results.push(...chunkResults);
  }

  return { kind: 'parallel', plans: results };
}

function chunkPlans(
  plans: TransactionPlan[],
  chunkSize?: number
): TransactionPlan[][] {
  if (!chunkSize) {
    return [plans];
  }

  return plans.reduce(
    (chunks, subPlan) => {
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk && lastChunk.length < chunkSize) {
        lastChunk.push(subPlan);
      } else {
        chunks.push([subPlan]);
      }
      return chunks;
    },
    [[]] as TransactionPlan[][]
  );
}

async function traverseSingle(
  transactionPlan: SingleTransactionPlan,
  context: TraverseContext
): Promise<TransactionPlanResult> {
  if (context.canceled) {
    return {
      kind: 'single',
      message: transactionPlan.message,
      status: { kind: 'canceled' },
    };
  }

  try {
    const result = await context.sendAndConfirm(transactionPlan.message, {
      abortSignal: context.abortSignal,
    });

    return {
      kind: 'single',
      message: transactionPlan.message,
      status: {
        kind: 'successful',
        transaction: result.transaction,
        context: result.context ?? {},
      },
    };
  } catch (error) {
    context.canceled = true;
    return {
      kind: 'single',
      message: transactionPlan.message,
      status: { kind: 'failed', error: error as SolanaError },
    };
  }
}
