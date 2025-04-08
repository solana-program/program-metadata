import { BaseTransactionMessage } from '@solana/kit';

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
  TTransactionMessage extends BaseTransactionMessage = BaseTransactionMessage,
> = Readonly<{
  kind: 'single';
  message: TTransactionMessage;
}>;

export function getAllSingleTransactionPlans(
  transactionPlan: TransactionPlan
): SingleTransactionPlan[] {
  if (transactionPlan.kind === 'single') {
    return [transactionPlan];
  }
  return transactionPlan.plans.flatMap(getAllSingleTransactionPlans);
}
