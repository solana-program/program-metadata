import { Address } from '@solana/kit';
import {
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

export function getSingleInstructionPlanFactory() {
  let counter = 0n;
  return (bytes: number): SingleInstructionPlan => {
    if (bytes < MINIMUM_INSTRUCTION_SIZE) {
      throw new Error(
        `Instruction size must be at least ${MINIMUM_INSTRUCTION_SIZE} bytes`
      );
    }
    const programAddress = BigInt('11111111111111111111111111111111') + counter;
    counter += 1n;
    return {
      kind: 'single',
      instruction: {
        programAddress: programAddress.toString() as Address,
        data: new Uint8Array(bytes - MINIMUM_INSTRUCTION_SIZE),
      },
    };
  };
}

export function txPercent(percent: number) {
  return Math.floor(
    ((MAXIMUM_TRANSACTION_SIZE - MINIMUM_TRANSACTION_SIZE) * percent) / 100
  );
}
