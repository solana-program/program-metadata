import { CompilableTransactionMessage } from '@solana/kit';

export type TransactionPlan =
  | SequentialTransactionPlan
  | ParallelTransactionPlan
  | SingleTransactionPlan;

export type SequentialTransactionPlan = Readonly<{
  kind: 'sequential';
  plans: TransactionPlan[];
  divisible: boolean;
}>;

export type ParallelTransactionPlan = Readonly<{
  kind: 'parallel';
  plans: TransactionPlan[];
}>;

export type SingleTransactionPlan<
  TTransactionMessage extends
    CompilableTransactionMessage = CompilableTransactionMessage,
> = Readonly<{
  kind: 'single';
  message: TTransactionMessage;
}>;

export function parallelTransactionPlan(
  plans: (CompilableTransactionMessage | TransactionPlan)[]
): ParallelTransactionPlan {
  return Object.freeze({
    kind: 'parallel',
    plans: parseSingleTransactionPlans(plans),
  });
}

export function sequentialTransactionPlan(
  plans: (CompilableTransactionMessage | TransactionPlan)[]
): SequentialTransactionPlan & { divisible: true } {
  return Object.freeze({
    divisible: true,
    kind: 'sequential',
    plans: parseSingleTransactionPlans(plans),
  });
}

export function nonDivisibleSequentialTransactionPlan(
  plans: (CompilableTransactionMessage | TransactionPlan)[]
): SequentialTransactionPlan & { divisible: false } {
  return Object.freeze({
    divisible: false,
    kind: 'sequential',
    plans: parseSingleTransactionPlans(plans),
  });
}

export function singleTransactionPlan<
  TTransactionMessage extends
    CompilableTransactionMessage = CompilableTransactionMessage,
>(
  transactionMessage: TTransactionMessage
): SingleTransactionPlan<TTransactionMessage> {
  return Object.freeze({ kind: 'single', message: transactionMessage });
}

function parseSingleTransactionPlans(
  plans: (CompilableTransactionMessage | TransactionPlan)[]
): TransactionPlan[] {
  return plans.map((plan) =>
    'kind' in plan ? plan : singleTransactionPlan(plan)
  );
}

export function getAllSingleTransactionPlans(
  transactionPlan: TransactionPlan
): SingleTransactionPlan[] {
  if (transactionPlan.kind === 'single') {
    return [transactionPlan];
  }
  return transactionPlan.plans.flatMap(getAllSingleTransactionPlans);
}
