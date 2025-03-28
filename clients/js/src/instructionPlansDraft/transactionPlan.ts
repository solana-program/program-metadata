import { BaseTransactionMessage } from '@solana/kit';

export type TransactionPlan =
  | SequentialTransactionPlan
  | ParallelTransactionPlan
  | StaticTransactionPlan;

export type SequentialTransactionPlan = Readonly<{
  kind: 'sequential';
  plans: TransactionPlan[];
}>;

export type ParallelTransactionPlan = Readonly<{
  kind: 'parallel';
  plans: TransactionPlan[];
}>;

export type StaticTransactionPlan<
  TTransactionMessage extends BaseTransactionMessage = BaseTransactionMessage,
> = Readonly<{
  kind: 'static';
  message: TTransactionMessage;
}>;
