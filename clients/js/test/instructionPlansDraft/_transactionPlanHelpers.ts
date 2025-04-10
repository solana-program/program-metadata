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
  setTransactionMessageLifetimeUsingProvisoryBlockhash,
  SingleTransactionPlan,
} from '../../src';

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
  return (instructions: IInstruction[] = []): SingleTransactionPlan => {
    return {
      kind: 'single',
      message: appendTransactionMessageInstructions(
        instructions,
        (createTransactionMessage ?? getMockCreateTransactionMessage)()
      ),
    };
  };
}
