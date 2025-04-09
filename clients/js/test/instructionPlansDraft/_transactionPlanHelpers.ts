import {
  Address,
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  IInstruction,
  createTransactionMessage as kitCreateTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
} from '@solana/kit';
import {
  ParallelTransactionPlan,
  SequentialTransactionPlan,
  setTransactionMessageLifetimeUsingProvisoryBlockhash,
  SingleTransactionPlan,
  TransactionPlan,
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

const MOCK_FEE_PAYER =
  'Gm1uVH3JxiLgafByNNmnoxLncB7ytpyWNqX3kRM9tSxN' as Address;

export const getMockCreateTransactionMessage = () => {
  return pipe(
    kitCreateTransactionMessage({ version: 0 }),
    setTransactionMessageLifetimeUsingProvisoryBlockhash,
    (tx) => setTransactionMessageFeePayer(MOCK_FEE_PAYER, tx)
  );
};

export function singleTransactionPlanFactory(
  createTransactionMessage?: () => CompilableTransactionMessage
) {
  return (instructions: IInstruction[]): SingleTransactionPlan => {
    return {
      kind: 'single',
      message: appendTransactionMessageInstructions(
        instructions,
        (createTransactionMessage ?? getMockCreateTransactionMessage)()
      ),
    };
  };
}
