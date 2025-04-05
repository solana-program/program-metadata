import {
  appendTransactionMessageInstruction,
  BaseTransactionMessage,
  IInstruction,
} from '@solana/kit';
import {
  getTransactionSize,
  TRANSACTION_SIZE_LIMIT,
} from './transactionPlanner';

export type InstructionPlan =
  | SequentialInstructionPlan
  | ParallelInstructionPlan
  | SingleInstructionPlan
  | IterableInstructionPlan;

export type SequentialInstructionPlan = Readonly<{
  kind: 'sequential';
  plans: InstructionPlan[];
  divisible: boolean;
}>;

export type ParallelInstructionPlan = Readonly<{
  kind: 'parallel';
  plans: InstructionPlan[];
}>;

export type SingleInstructionPlan<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  kind: 'single';
  instruction: TInstruction;
}>;

export type IterableInstructionPlan<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  kind: 'iterable';
  /** Get all the instructions in one go or return `null` if not possible */
  getAll: () => TInstruction[] | null;
  /** Get an iterator for the instructions. */
  getIterator: () => InstructionIterator<TInstruction>;
}>;

export type InstructionIterator<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  /** Checks whether there are more instructions to retrieve. */
  hasNext: () => boolean;
  /** Get the next instruction for the given transaction message or return `null` if not possible. */
  next: (transactionMessage: BaseTransactionMessage) => TInstruction | null;
}>;

export function getLinearIterableInstructionPlan({
  getInstruction,
  totalBytes,
}: {
  getInstruction: (offset: number, length: number) => IInstruction;
  totalBytes: number;
}): IterableInstructionPlan {
  return {
    kind: 'iterable',
    getAll: () => [getInstruction(0, totalBytes)],
    getIterator: () => {
      let offset = 0;
      return {
        hasNext: () => offset < totalBytes,
        next: (tx: BaseTransactionMessage) => {
          const baseTransactionSize = getTransactionSize(
            appendTransactionMessageInstruction(getInstruction(offset, 0), tx)
          );
          const length =
            TRANSACTION_SIZE_LIMIT -
            baseTransactionSize -
            2; /* Leeway for shortU16 numbers in transaction headers. */

          if (length <= 0) {
            return null;
          }

          offset += length;
          return getInstruction(offset, length);
        },
      };
    },
  };
}

export function getIterableInstructionPlanFromInstructions<
  TInstruction extends IInstruction = IInstruction,
>(instructions: TInstruction[]): IterableInstructionPlan<TInstruction> {
  return {
    kind: 'iterable',
    getAll: () => instructions,
    getIterator: () => {
      let instructionIndex = 0;
      return {
        hasNext: () => instructionIndex < instructions.length,
        next: (tx: BaseTransactionMessage) => {
          if (instructionIndex >= instructions.length) {
            return null;
          }

          const instruction = instructions[instructionIndex];
          const transactionSize = getTransactionSize(
            appendTransactionMessageInstruction(instruction, tx)
          );

          if (transactionSize > TRANSACTION_SIZE_LIMIT) {
            return null;
          }

          instructionIndex++;
          return instruction;
        },
      };
    },
  };
}

const REALLOC_LIMIT = 10_240;

export function getReallocIterableInstructionPlan({
  getInstruction,
  totalSize,
}: {
  getInstruction: (size: number) => IInstruction;
  totalSize: number;
}): IterableInstructionPlan {
  const numberOfInstructions = Math.ceil(totalSize / REALLOC_LIMIT);
  const lastInstructionSize = totalSize % REALLOC_LIMIT;
  const instructions = new Array(numberOfInstructions)
    .fill(0)
    .map((_, i) =>
      getInstruction(
        i === numberOfInstructions - 1 ? lastInstructionSize : REALLOC_LIMIT
      )
    );

  return getIterableInstructionPlanFromInstructions(instructions);
}
