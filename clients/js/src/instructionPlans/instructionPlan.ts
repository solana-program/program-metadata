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
  | MessagePackerInstructionPlan;

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

export type MessagePackerInstructionPlan = Readonly<{
  kind: 'messagePacker';
  getMessagePacker: () => MessagePacker;
}>;

export type MessagePacker = Readonly<{
  /** Checks whether there are more instructions to retrieve. */
  done: () => boolean;
  /** Pack the provided transaction message with the next instructions or throws if not possible. */
  packMessageToCapacity: (
    transactionMessage: CompilableTransactionMessage
  ) => CompilableTransactionMessage;
}>;

// TODO: Make SolanaError instead.
export class CannotPackUsingProvidedMessageError extends Error {
  constructor() {
    super('Cannot pack the next instructions using the provided message');
    this.name = 'CannotPackUsingProvidedMessageError';
  }
}

// TODO: Make SolanaError instead.
export class MessagePackerIsAlreadyDoneError extends Error {
  constructor() {
    super(
      'Failed to pack the next message because the message packer is already done'
    );
    this.name = 'MessagePackerIsAlreadyDoneError';
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

export function getLinearMessagePackerInstructionPlan({
  getInstruction,
  totalLength: totalBytes,
}: {
  getInstruction: (offset: number, length: number) => IInstruction;
  totalLength: number;
}): MessagePackerInstructionPlan {
  return {
    kind: 'messagePacker',
    getMessagePacker: () => {
      let offset = 0;
      return {
        done: () => offset >= totalBytes,
        packMessageToCapacity: (message: CompilableTransactionMessage) => {
          if (offset >= totalBytes) {
            throw new MessagePackerIsAlreadyDoneError();
          }

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
            throw new CannotPackUsingProvidedMessageError();
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

export function getMessagePackerInstructionPlanFromInstructions<
  TInstruction extends IInstruction = IInstruction,
>(instructions: TInstruction[]): MessagePackerInstructionPlan {
  return {
    kind: 'messagePacker',
    getMessagePacker: () => {
      let instructionIndex = 0;
      return {
        done: () => instructionIndex >= instructions.length,
        packMessageToCapacity: (message: CompilableTransactionMessage) => {
          if (instructionIndex >= instructions.length) {
            throw new MessagePackerIsAlreadyDoneError();
          }

          let updatedMessage: CompilableTransactionMessage = message;
          for (
            let index = instructionIndex;
            index < instructions.length;
            index++
          ) {
            updatedMessage = appendTransactionMessageInstruction(
              instructions[index],
              message
            );

            if (getTransactionSize(updatedMessage) > TRANSACTION_SIZE_LIMIT) {
              if (index === instructionIndex) {
                throw new CannotPackUsingProvidedMessageError();
              }
              instructionIndex = index;
              return updatedMessage;
            }
          }

          instructionIndex = instructions.length;
          return updatedMessage;
        },
      };
    },
  };
}

const REALLOC_LIMIT = 10_240;

export function getReallocMessagePackerInstructionPlan({
  getInstruction,
  totalSize,
}: {
  getInstruction: (size: number) => IInstruction;
  totalSize: number;
}): MessagePackerInstructionPlan {
  const numberOfInstructions = Math.ceil(totalSize / REALLOC_LIMIT);
  const lastInstructionSize = totalSize % REALLOC_LIMIT;
  const instructions = new Array(numberOfInstructions)
    .fill(0)
    .map((_, i) =>
      getInstruction(
        i === numberOfInstructions - 1 ? lastInstructionSize : REALLOC_LIMIT
      )
    );

  return getMessagePackerInstructionPlanFromInstructions(instructions);
}
