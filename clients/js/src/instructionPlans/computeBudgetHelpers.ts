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
  CompilableTransactionMessage,
  getComputeUnitEstimateForTransactionMessageFactory,
  getU32Decoder,
  IInstruction,
  ITransactionMessageWithFeePayer,
  offsetDecoder,
  Rpc,
  SimulateTransactionApi,
  TransactionMessage,
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

export async function estimateAndUpdateProvisorySetComputeUnitLimitInstruction<
  TTransactionMessage extends
    | CompilableTransactionMessage
    | (ITransactionMessageWithFeePayer & TransactionMessage),
>(
  rpc: Rpc<SimulateTransactionApi>,
  transactionMessage: TTransactionMessage
): Promise<TTransactionMessage> {
  const getComputeUnitEstimateForTransactionMessage =
    getComputeUnitEstimateForTransactionMessageFactory({ rpc });

  const instructionDetails =
    getSetComputeUnitLimitInstructionIndexAndUnits(transactionMessage);

  // If the transaction message already has a compute unit limit instruction
  // which is set to a specific value — i.e. not 0 or the maximum limit —
  // we don't need to estimate the compute unit limit.
  if (
    instructionDetails &&
    instructionDetails.units !== PROVISORY_COMPUTE_UNIT_LIMIT &&
    instructionDetails.units !== MAX_COMPUTE_UNIT_LIMIT
  ) {
    return transactionMessage;
  }

  const units =
    await getComputeUnitEstimateForTransactionMessage(transactionMessage);
  return updateOrAppendSetComputeUnitLimitInstruction(
    () => units,
    transactionMessage
  );
}

function updateOrAppendSetComputeUnitLimitInstruction<
  TTransactionMessage extends BaseTransactionMessage,
>(
  getUnits: (previousUnits: number | null) => number,
  transactionMessage: TTransactionMessage
): TTransactionMessage {
  const instructionDetails =
    getSetComputeUnitLimitInstructionIndexAndUnits(transactionMessage);

  if (!instructionDetails) {
    return appendTransactionMessageInstruction(
      getSetComputeUnitLimitInstruction({ units: getUnits(null) }),
      transactionMessage
    );
  }

  const { index, units: previousUnits } = instructionDetails;
  const units = getUnits(previousUnits);
  if (units === previousUnits) {
    return transactionMessage;
  }

  const nextInstruction = getSetComputeUnitLimitInstruction({ units });
  const nextInstructions = [...transactionMessage.instructions];
  nextInstructions.splice(index, 1, nextInstruction);
  return { ...transactionMessage, instructions: nextInstructions };
}

function getSetComputeUnitLimitInstructionIndexAndUnits(
  transactionMessage: BaseTransactionMessage
): { index: number; units: number } | null {
  const index = getSetComputeUnitLimitInstructionIndex(transactionMessage);
  if (index < 0) {
    return null;
  }

  const units = getSetComputeUnitLimitInstructionUnits(
    transactionMessage.instructions[index]
  );

  return { index, units };
}

function getSetComputeUnitLimitInstructionIndex(
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

function getSetComputeUnitLimitInstructionUnits(instruction: IInstruction) {
  const unitsDecoder = offsetDecoder(getU32Decoder(), {
    preOffset: ({ preOffset }) => preOffset + 1,
  });
  return unitsDecoder.decode(instruction.data as Uint8Array);
}
