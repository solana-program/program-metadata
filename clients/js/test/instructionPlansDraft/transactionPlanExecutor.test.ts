import { compileTransaction, SolanaError } from '@solana/kit';
import test, { Assertions } from 'ava';
import {
  createBaseTransactionPlanExecutor,
  TransactionPlanResult,
} from '../../src';
import {
  sequentialTransactionPlan,
  singleTransactionPlanFactory,
} from './_transactionPlanHelpers';
import {
  canceledSingleTransactionPlan,
  failedSingleTransactionPlan,
  sequentialTransactionPlanResult,
  successfulSingleTransactionPlan,
} from './_transactionPlanResultHelpers';

function getMockSolanaError(): SolanaError {
  return {} as SolanaError;
}

async function assertFailedResult(
  t: Assertions,
  promise: Promise<TransactionPlanResult>
): Promise<TransactionPlanResult> {
  const executorError = (await t.throwsAsync(promise)) as Error & {
    result: TransactionPlanResult;
  };
  return executorError.result;
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

  const result = await assertFailedResult(t, executor(plan));

  t.deepEqual(result, failedSingleTransactionPlan(plan, planError));
});

test('it handles aborted single transactions', async (t) => {
  const singleTransactionPlan = singleTransactionPlanFactory();
  const plan = singleTransactionPlan();

  const executor = createBaseTransactionPlanExecutor({
    sendAndConfirm: (tx) =>
      Promise.resolve({ transaction: compileTransaction(tx) }),
  });

  const abortController = new AbortController();
  abortController.abort();
  const promise = executor(plan, { abortSignal: abortController.signal });

  const result = await assertFailedResult(t, promise);

  t.deepEqual(result, canceledSingleTransactionPlan(plan));
});

test('it cancels transactions after a failed one in a sequential plan', async (t) => {
  const singleTransactionPlan = singleTransactionPlanFactory();

  const planA = singleTransactionPlan();
  const planB = singleTransactionPlan();
  const planC = singleTransactionPlan();

  const planBError = getMockSolanaError();
  const executor = createBaseTransactionPlanExecutor({
    sendAndConfirm: (tx) =>
      tx === planB.message
        ? Promise.reject(planBError)
        : Promise.resolve({ transaction: compileTransaction(tx) }),
  });

  const promise = executor(sequentialTransactionPlan([planA, planB, planC]));
  const result = await assertFailedResult(t, promise);

  t.deepEqual(
    result,
    sequentialTransactionPlanResult([
      successfulSingleTransactionPlan(planA),
      failedSingleTransactionPlan(planB, planBError),
      canceledSingleTransactionPlan(planC),
    ])
  );
});
