import {
  Address,
  appendTransactionMessageInstruction,
  CompilableTransactionMessage,
  fixEncoderSize,
  getAddressDecoder,
  getU64Encoder,
  IInstruction,
} from '@solana/kit';
import {
  CannotIterateUsingProvidedMessageError,
  getTransactionSize,
  IterableInstructionPlan,
  TRANSACTION_SIZE_LIMIT,
} from '../../src';

const MINIMUM_INSTRUCTION_SIZE = 35;
const MINIMUM_TRANSACTION_SIZE = 136;
const MAXIMUM_TRANSACTION_SIZE = TRANSACTION_SIZE_LIMIT - 1; // (for shortU16)

export function instructionIteratorFactory() {
  const baseCounter = 1_000_000_000n;
  const iteratorIncrement = 1_000_000_000n;
  let iteratorCounter = 0n;
  return (
    totalBytes: number
  ): IterableInstructionPlan & {
    get: (bytes: number, index: number) => IInstruction;
  } => {
    const getInstruction = instructionFactory(baseCounter + iteratorCounter);
    iteratorCounter += iteratorIncrement;
    const baseInstruction = getInstruction(MINIMUM_INSTRUCTION_SIZE, 0);

    return {
      get: getInstruction,
      kind: 'iterable',
      getIterator: () => {
        let offset = 0;
        return {
          hasNext: () => offset < totalBytes,
          next: (tx) => {
            const baseTransactionSize = getTransactionSize(
              appendTransactionMessageInstruction(baseInstruction, tx)
            );
            const maxLength =
              TRANSACTION_SIZE_LIMIT -
              baseTransactionSize -
              1; /* Leeway for shortU16 numbers in transaction headers. */

            if (maxLength <= 0) {
              throw new CannotIterateUsingProvidedMessageError();
            }

            const length = Math.min(
              totalBytes - offset,
              maxLength + MINIMUM_INSTRUCTION_SIZE
            );

            const instruction = getInstruction(length);
            offset += length;
            return instruction;
          },
        };
      },
    };
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
  createTransactionMessage?: () => CompilableTransactionMessage
) {
  const minimumTransactionSize = createTransactionMessage
    ? getTransactionSize(createTransactionMessage())
    : MINIMUM_TRANSACTION_SIZE;
  return (percent: number) => {
    return Math.floor(
      ((MAXIMUM_TRANSACTION_SIZE - minimumTransactionSize) * percent) / 100
    );
  };
}
