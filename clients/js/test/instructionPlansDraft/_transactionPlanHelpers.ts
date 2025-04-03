import {
  appendTransactionMessageInstructions,
  BaseTransactionMessage,
  createTransactionMessage,
  IInstruction,
} from '@solana/kit';
import {
  TransactionPlan,
  ParallelTransactionPlan,
  SequentialTransactionPlan,
  SingleTransactionPlan,
} from '../../src';

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

export function getSingleTransactionPlanFactory(
  defaultMessage?: () => BaseTransactionMessage
) {
  const defaultMessageFn =
    defaultMessage ?? (() => createTransactionMessage({ version: 0 }));
  return (instructions: IInstruction[]): SingleTransactionPlan => {
    return {
      kind: 'single',
      message: appendTransactionMessageInstructions(
        instructions,
        defaultMessageFn()
      ),
    };
  };
}
