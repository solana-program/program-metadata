import { BaseTransactionMessage, Signature, SolanaError } from '@solana/kit';

export type TransactionPlanResult<TContext extends object | null = null> =
  | SequentialTransactionPlanResult<TContext>
  | ParallelTransactionPlanResult<TContext>
  | StaticTransactionPlanResult<TContext>;

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

export type StaticTransactionPlanResult<
  TContext extends object | null = null,
  TTransactionMessage extends BaseTransactionMessage = BaseTransactionMessage,
> = Readonly<{
  context: TContext;
  kind: 'static';
  message: TTransactionMessage;
  signature: Signature;
  status: TransactionPlanResultStatus;
}>;

export type TransactionPlanResultStatus =
  | { kind: 'success' }
  | { kind: 'error'; error: SolanaError }
  | { kind: 'canceled' };
