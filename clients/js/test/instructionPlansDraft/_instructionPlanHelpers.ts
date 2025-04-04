import { Address, BaseTransactionMessage, IInstruction } from '@solana/kit';
import {
  getTransactionSize,
  InstructionPlan,
  ParallelInstructionPlan,
  SequentialInstructionPlan,
  SingleInstructionPlan,
} from '../../src';

const MINIMUM_INSTRUCTION_SIZE = 35;
const MINIMUM_TRANSACTION_SIZE = 136;
const MAXIMUM_TRANSACTION_SIZE = 1230; // 1280 - 48 (for header) - 2 (for shortU16)

export function parallelInstructionPlan(
  plans: InstructionPlan[]
): ParallelInstructionPlan {
  return { kind: 'parallel', plans };
}

export function sequentialInstructionPlan(
  plans: InstructionPlan[]
): SequentialInstructionPlan {
  return { kind: 'sequential', divisible: true, plans };
}

export function nonDivisibleSequentialInstructionPlan(
  plans: InstructionPlan[]
): SequentialInstructionPlan {
  return { kind: 'sequential', divisible: false, plans };
}

export function singleInstructionPlan(
  instruction: IInstruction
): SingleInstructionPlan {
  return { kind: 'single', instruction };
}

export function instructionFactory() {
  let counter = 0n;
  return (bytes: number): IInstruction => {
    if (bytes < MINIMUM_INSTRUCTION_SIZE) {
      throw new Error(
        `Instruction size must be at least ${MINIMUM_INSTRUCTION_SIZE} bytes`
      );
    }
    const programAddress = BigInt('11111111111111111111111111111111') + counter;
    counter += 1n;
    return {
      programAddress: programAddress.toString() as Address,
      data: new Uint8Array(bytes - MINIMUM_INSTRUCTION_SIZE),
    };
  };
}

export function transactionPercentFactory(
  defaultMessage?: () => BaseTransactionMessage
) {
  const minimumTransactionSize = defaultMessage
    ? getTransactionSize(defaultMessage())
    : MINIMUM_TRANSACTION_SIZE;
  return (percent: number) => {
    return Math.floor(
      ((MAXIMUM_TRANSACTION_SIZE - minimumTransactionSize) * percent) / 100
    );
  };
}
