// TODO: This will need decoupling from `@solana-program/compute-budget` when added to `@solana/instruction-plans`

// TODO: The function `getComputeUnitEstimateForTransactionMessageFactory` will need to
// move in a granular package so `instruction-plans` can use it.

import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  ComputeBudgetInstruction,
  getSetComputeUnitLimitInstruction,
  identifyComputeBudgetInstruction,
} from '@solana-program/compute-budget';
import {
  appendTransactionMessageInstruction,
  BaseTransactionMessage,
  getU32Decoder,
  IInstruction,
  offsetDecoder,
} from '@solana/kit';

// Setting it to zero ensures the transaction fails unless it is properly estimated.
export const PROVISORY_COMPUTE_UNIT_LIMIT = 0;

// This is the maximum compute unit limit that can be set for a transaction.
export const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

export function fillProvisorySetComputeUnitLimitInstruction<
  TTransactionMessage extends BaseTransactionMessage,
>(transactionMessage: TTransactionMessage) {
  return updateOrAppendSetComputeUnitLimitInstruction(
    (previousUnits) =>
      previousUnits === null ? PROVISORY_COMPUTE_UNIT_LIMIT : previousUnits,
    transactionMessage
  );
}

export function updateOrAppendSetComputeUnitLimitInstruction<
  TTransactionMessage extends BaseTransactionMessage,
>(
  getUnits: (previousUnits: number | null) => number,
  transactionMessage: TTransactionMessage
): TTransactionMessage {
  const instructionIndex =
    getSetComputeUnitLimitInstructionIndex(transactionMessage);

  if (instructionIndex === -1) {
    return appendTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units: getUnits(null) }),
      transactionMessage
    );
  }

  const previousUnits = getUnitsFromSetComputeUnitLimitInstruction(
    transactionMessage.instructions[instructionIndex]
  );
  const units = getUnits(previousUnits);
  if (units === previousUnits) {
    return transactionMessage;
  }

  const nextInstruction = getSetComputeUnitLimitInstruction({ units });
  const nextInstructions = [...transactionMessage.instructions];
  nextInstructions.splice(instructionIndex, 1, nextInstruction);
  return { ...transactionMessage, instructions: nextInstructions };
}

export function getSetComputeUnitLimitInstructionIndex(
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

export function getUnitsFromSetComputeUnitLimitInstruction(
  instruction: IInstruction
) {
  const unitsDecoder = offsetDecoder(getU32Decoder(), {
    preOffset: ({ preOffset }) => preOffset + 1,
  });
  return unitsDecoder.decode(instruction.data as Uint8Array);
}
