import { compileTransaction, SolanaError, Transaction } from '@solana/kit';
import {
  ParallelTransactionPlanResult,
  SequentialTransactionPlanResult,
  SingleTransactionPlan,
  SingleTransactionPlanResult,
  TransactionPlanResult,
} from '../../src';

export function parallelTransactionPlanResult(
  plans: TransactionPlanResult[]
): ParallelTransactionPlanResult {
  return { kind: 'parallel', plans };
}

export function sequentialTransactionPlanResult(
  plans: TransactionPlanResult[]
): SequentialTransactionPlanResult {
  return { kind: 'sequential', divisible: true, plans };
}

export function nonDivisibleSequentialTransactionPlanResult(
  plans: TransactionPlanResult[]
): SequentialTransactionPlanResult {
  return { kind: 'sequential', divisible: false, plans };
}

export function successfulSingleTransactionPlan(
  plan: SingleTransactionPlan,
  transaction?: Transaction,
  context?: object
): SingleTransactionPlanResult {
  return {
    kind: 'single',
    message: plan.message,
    status: {
      kind: 'successful',
      transaction: transaction ?? compileTransaction(plan.message),
      context: context ?? {},
    },
  };
}

export function failedSingleTransactionPlan(
  plan: SingleTransactionPlan,
  error: SolanaError
): SingleTransactionPlanResult {
  return {
    kind: 'single',
    message: plan.message,
    status: { kind: 'failed', error },
  };
}

export function canceledSingleTransactionPlan(
  plan: SingleTransactionPlan
): SingleTransactionPlanResult {
  return {
    kind: 'single',
    message: plan.message,
    status: { kind: 'canceled' },
  };
}
