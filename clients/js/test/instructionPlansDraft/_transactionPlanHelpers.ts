import {
  Address,
  appendTransactionMessageInstructions,
  Blockhash,
  CompilableTransactionMessage,
  IInstruction,
  createTransactionMessage as kitCreateTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import {
  ParallelTransactionPlan,
  SequentialTransactionPlan,
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
const MOCK_BLOCKHASH = {
  blockhash: '11111111111111111111111111111111' as Blockhash,
  lastValidBlockHeight: 0n,
} as const;

export const getMockCreateTransactionMessage = () => {
  return pipe(
    kitCreateTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(MOCK_BLOCKHASH, tx),
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
