import test from 'ava';
import { singleTransactionPlanFactory } from './_transactionPlanHelpers';
import { createBaseTransactionPlanExecutor } from '../../src';
import { compileTransaction, SolanaError } from '@solana/kit';
import {
  failedSingleTransactionPlan,
  successfulSingleTransactionPlan,
} from './_transactionPlanResultHelpers';
import { TransactionPlanResult } from '../../src/instructionPlansDraft/transactionPlanResult';

function getMockSolanaError(): SolanaError {
  return {} as SolanaError;
}

test('it handles successful single transactions', async (t) => {
  const singleTransactionPlan = singleTransactionPlanFactory();
  const plan = singleTransactionPlan();

  const executor = createBaseTransactionPlanExecutor({
    sendAndConfirm: (tx) =>
      Promise.resolve({ transaction: compileTransaction(tx) }),
  });

  t.deepEqual(await executor(plan), successfulSingleTransactionPlan(plan));
});

test('it handles failed single transactions', async (t) => {
  const singleTransactionPlan = singleTransactionPlanFactory();
  const plan = singleTransactionPlan();

  const planError = getMockSolanaError();
  const executor = createBaseTransactionPlanExecutor({
    sendAndConfirm: () => Promise.reject(planError),
  });

  const promise = executor(plan);
  const executorError = (await t.throwsAsync(promise)) as Error & {
    result: TransactionPlanResult;
  };

  t.deepEqual(
    executorError.result,
    failedSingleTransactionPlan(plan, planError)
  );
});
