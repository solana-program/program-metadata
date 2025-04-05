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
  getIterator: () => InstructionIterator<TInstruction>;
}>;

export type InstructionIterator<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  /** Get all remaining instructions or return `null` if not possible */
  all: () => TInstruction[] | null;
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
    getIterator: () => {
      let offset = 0;
      return {
        all: () => [getInstruction(offset, totalBytes - offset)],
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

const REALLOC_LIMIT = 10_240;

export function getReallocIterableInstructionPlan({
  getInstruction,
  totalSize,
}: {
  getInstruction: (size: number) => IInstruction;
  totalSize: number;
}): IterableInstructionPlan {
  return {
    kind: 'iterable',
    getIterator: () => {
      let instructionIndex = 0;
      const numberOfInstructions = Math.ceil(totalSize / REALLOC_LIMIT);
      const lastInstructionSize = totalSize % REALLOC_LIMIT;
      const instructions = new Array(numberOfInstructions)
        .fill(0)
        .map((_, i) => {
          const size =
            i === numberOfInstructions - 1
              ? lastInstructionSize
              : REALLOC_LIMIT;
          return getInstruction(size);
        });
      return {
        all: () => instructions,
        hasNext: () => instructionIndex < numberOfInstructions,
        next: () =>
          instructionIndex < numberOfInstructions
            ? instructions[instructionIndex++]
            : null,
      };
    },
  };
}
