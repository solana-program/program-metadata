import {
  Address,
  BaseTransactionMessage,
  fixEncoderSize,
  getAddressDecoder,
  getU64Encoder,
  IInstruction,
} from '@solana/kit';
import {
  getLinearIterableInstructionPlan,
  getTransactionSize,
  InstructionPlan,
  IterableInstructionPlan,
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

export function instructionIteratorFactory() {
  const baseCounter = 1_000_000_000n;
  const iteratorIncrement = 1_000_000_000n;
  let iteratorCounter = 0n;
  return (
    totalBytes: number
  ): IterableInstructionPlan & {
    get: (bytes: number, index: number) => IInstruction;
  } => {
    const get = instructionFactory(baseCounter + iteratorCounter);
    iteratorCounter += iteratorIncrement;

    const iterator = getLinearIterableInstructionPlan({
      totalBytes,
      getInstruction: (offset, length) => {
        console.log({ offset, length });
        return get(length + MINIMUM_INSTRUCTION_SIZE);
      },
    });

    return { ...iterator, get };
  };
}

export function instructionFactory(baseCounter: bigint = 0n) {
  const counterEncoder = fixEncoderSize(getU64Encoder(), 32);
  const addressDecoder = getAddressDecoder();
  const getProgramAddress = (counter: bigint): Address =>
    addressDecoder.decode(counterEncoder.encode(counter));

  let counter = 0n;
  return (bytes: number, counterOverride?: number): IInstruction => {
    if (bytes < MINIMUM_INSTRUCTION_SIZE) {
      throw new Error(
        `Instruction size must be at least ${MINIMUM_INSTRUCTION_SIZE} bytes`
      );
    }
    const currentCounter =
      baseCounter +
      (counterOverride === undefined ? counter : BigInt(counterOverride));
    if (counterOverride === undefined) {
      counter += 1n;
    }
    return {
      programAddress: getProgramAddress(currentCounter),
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
