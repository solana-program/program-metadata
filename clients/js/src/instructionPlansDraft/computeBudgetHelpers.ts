// TODO: This will need decoupling from `@solana-program/compute-budget`
// when added to `@solana/instruction-plans`. Also, the function
// `getComputeUnitEstimateForTransactionMessageFactory` will need to
// move in a granular package so `instruction-plans` can use it.

import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  ComputeBudgetInstruction,
  getSetComputeUnitLimitInstruction,
  identifyComputeBudgetInstruction,
} from '@solana-program/compute-budget';
import {
  BaseTransactionMessage,
  prependTransactionMessageInstruction,
} from '@solana/kit';

// Setting it to zero ensures the transaction fails unless it is properly estimated.
export const PROVISORY_COMPUTE_UNIT_LIMIT = 0;

export function updateOrPrependProvisorySetComputeUnitLimitInstruction<
  TTransactionMessage extends BaseTransactionMessage,
>(transactionMessage: TTransactionMessage) {
  return updateOrPrependSetComputeUnitLimitInstruction(
    PROVISORY_COMPUTE_UNIT_LIMIT,
    transactionMessage
  );
}

export function updateOrPrependSetComputeUnitLimitInstruction<
  TTransactionMessage extends BaseTransactionMessage,
>(units: number, transactionMessage: TTransactionMessage): TTransactionMessage {
  const instructionIndex =
    getComputeUnitLimitInstructionIndex(transactionMessage);

  if (instructionIndex === -1) {
    return prependTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units }),
      transactionMessage
    );
  }

  return {
    ...transactionMessage,
    instructions: [
      ...transactionMessage.instructions.slice(0, instructionIndex),
      getSetComputeUnitLimitInstruction({ units }),
      ...transactionMessage.instructions.slice(instructionIndex + 1),
    ],
  };
}

export function getComputeUnitLimitInstructionIndex(
  transactionMessage: BaseTransactionMessage
) {
  return transactionMessage.instructions.findIndex((ix) => {
    return (
      ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
      identifyComputeBudgetInstruction(ix.data as Uint8Array) ===
        ComputeBudgetInstruction.SetComputeUnitLimit
    );
  });
}
