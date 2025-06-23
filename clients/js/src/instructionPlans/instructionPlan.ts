import {
  appendTransactionMessageInstruction,
  CompilableTransactionMessage,
  IInstruction,
} from '@solana/kit';
import {
  getTransactionSize,
  TRANSACTION_SIZE_LIMIT,
} from './transactionHelpers';

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

export type IterableInstructionPlan = Readonly<{
  kind: 'iterable';
  /** Get an iterator for the instructions. */
  getIterator: () => InstructionIterator;
}>;

export type InstructionIterator = Readonly<{
  /** Checks whether there are more instructions to retrieve. */
  hasNext: () => boolean;
  /** Get the next instruction for the given transaction message or return `null` if not possible. */
  next: (
    transactionMessage: CompilableTransactionMessage
  ) => CompilableTransactionMessage;
}>;

// TODO: Make SolanaError instead.
export class CannotIterateUsingProvidedMessageError extends Error {
  constructor() {
    super('Cannot iterate the next instruction using the provided message');
    this.name = 'CannotIterateUsingProvidedMessageError';
  }
}

export function parallelInstructionPlan(
  plans: (InstructionPlan | IInstruction)[]
): ParallelInstructionPlan {
  return { kind: 'parallel', plans: parseSingleInstructionPlans(plans) };
}

export function sequentialInstructionPlan(
  plans: (InstructionPlan | IInstruction)[]
): SequentialInstructionPlan {
  return {
    kind: 'sequential',
    divisible: true,
    plans: parseSingleInstructionPlans(plans),
  };
}

export function nonDivisibleSequentialInstructionPlan(
  plans: (InstructionPlan | IInstruction)[]
): SequentialInstructionPlan {
  return {
    kind: 'sequential',
    divisible: false,
    plans: parseSingleInstructionPlans(plans),
  };
}

export function singleInstructionPlan(
  instruction: IInstruction
): SingleInstructionPlan {
  return { kind: 'single', instruction };
}

function parseSingleInstructionPlans(
  plans: (InstructionPlan | IInstruction)[]
): InstructionPlan[] {
  return plans.map((plan) =>
    'kind' in plan ? plan : singleInstructionPlan(plan)
  );
}

export function getLinearIterableInstructionPlan({
  getInstruction,
  totalLength: totalBytes,
}: {
  getInstruction: (offset: number, length: number) => IInstruction;
  totalLength: number;
}): IterableInstructionPlan {
  return {
    kind: 'iterable',
    getIterator: () => {
      let offset = 0;
      return {
        hasNext: () => offset < totalBytes,
        next: (message: CompilableTransactionMessage) => {
          const baseTransactionSize = getTransactionSize(
            appendTransactionMessageInstruction(
              getInstruction(offset, 0),
              message
            )
          );
          const maxLength =
            TRANSACTION_SIZE_LIMIT -
            baseTransactionSize -
            1; /* Leeway for shortU16 numbers in transaction headers. */

          if (maxLength <= 0) {
            throw new CannotIterateUsingProvidedMessageError();
          }

          const length = Math.min(totalBytes - offset, maxLength);
          const instruction = getInstruction(offset, length);
          offset += length;
          return appendTransactionMessageInstruction(instruction, message);
        },
      };
    },
  };
}

export function getIterableInstructionPlanFromInstructions<
  TInstruction extends IInstruction = IInstruction,
>(instructions: TInstruction[]): IterableInstructionPlan {
  return {
    kind: 'iterable',
    getIterator: () => {
      let instructionIndex = 0;
      return {
        hasNext: () => instructionIndex < instructions.length,
        next: (message: CompilableTransactionMessage) => {
          if (instructionIndex >= instructions.length) {
            throw new CannotIterateUsingProvidedMessageError();
          }

          const instruction = instructions[instructionIndex];
          const transactionSize = getTransactionSize(
            appendTransactionMessageInstruction(instruction, message)
          );

          if (transactionSize > TRANSACTION_SIZE_LIMIT) {
            throw new CannotIterateUsingProvidedMessageError();
          }

          instructionIndex++;
          return appendTransactionMessageInstruction(instruction, message);
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
