import { BaseTransactionMessage, Signature, SolanaError } from '@solana/kit';

export type TransactionPlanResult<TContext extends object | null = null> =
  | SequentialTransactionPlanResult<TContext>
  | ParallelTransactionPlanResult<TContext>
  | SingleTransactionPlanResult<TContext>;

export type SequentialTransactionPlanResult<
  TContext extends object | null = null,
> = Readonly<{
  kind: 'sequential';
  plans: TransactionPlanResult<TContext>[];
}>;

export type ParallelTransactionPlanResult<
  TContext extends object | null = null,
> = Readonly<{
  kind: 'parallel';
  plans: TransactionPlanResult<TContext>[];
}>;

export type SingleTransactionPlanResult<
  TContext extends object | null = null,
  TTransactionMessage extends BaseTransactionMessage = BaseTransactionMessage,
> = Readonly<{
  context: TContext;
  kind: 'single';
  message: TTransactionMessage;
  signature: Signature;
  status: TransactionPlanResultStatus;
}>;

export type TransactionPlanResultStatus =
  | { kind: 'success' }
  | { kind: 'error'; error: SolanaError }
  | { kind: 'canceled' };
