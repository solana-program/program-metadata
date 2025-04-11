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
  plans: TransactionPlan[]
): ParallelTransactionPlan {
  return { kind: 'parallel', plans };
}

export function sequentialTransactionPlan(
  plans: TransactionPlan[]
): SequentialTransactionPlan {
  return { kind: 'sequential', divisible: true, plans };
}

export function nonDivisibleSequentialTransactionPlan(
  plans: TransactionPlan[]
): SequentialTransactionPlan {
  return { kind: 'sequential', divisible: false, plans };
}

export function getAllSingleTransactionPlans(
  transactionPlan: TransactionPlan
): SingleTransactionPlan[] {
  if (transactionPlan.kind === 'single') {
    return [transactionPlan];
  }
  return transactionPlan.plans.flatMap(getAllSingleTransactionPlans);
}
