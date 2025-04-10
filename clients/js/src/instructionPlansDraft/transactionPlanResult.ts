import {
  CompilableTransactionMessage,
  SolanaError,
  Transaction,
} from '@solana/kit';

export type TransactionPlanResult<TContext extends object = object> =
  | SequentialTransactionPlanResult<TContext>
  | ParallelTransactionPlanResult<TContext>
  | SingleTransactionPlanResult<TContext>;

export type SequentialTransactionPlanResult<TContext extends object = object> =
  Readonly<{
    kind: 'sequential';
    plans: TransactionPlanResult<TContext>[];
  }>;

export type ParallelTransactionPlanResult<TContext extends object = object> =
  Readonly<{
    kind: 'parallel';
    plans: TransactionPlanResult<TContext>[];
  }>;

export type SingleTransactionPlanResult<
  TContext extends object = object,
  TTransactionMessage extends
    CompilableTransactionMessage = CompilableTransactionMessage,
> = Readonly<{
  kind: 'single';
  message: TTransactionMessage;
  status: TransactionPlanResultStatus<TContext>;
}>;

export type TransactionPlanResultStatus<TContext extends object = object> =
  | { kind: 'canceled' }
  | { kind: 'error'; error: SolanaError }
  | { kind: 'success'; context: TContext; transaction: Transaction };
