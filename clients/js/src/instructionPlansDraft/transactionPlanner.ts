import {
  Address,
  appendTransactionMessageInstruction,
  BaseTransactionMessage,
  Blockhash,
  CompilableTransactionMessage,
  compileTransaction,
  createTransactionMessage,
  getTransactionEncoder,
  ITransactionMessageWithFeePayer,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionMessageWithBlockhashLifetime,
  TransactionVersion,
} from '@solana/kit';
import { InstructionPlan } from './instructionPlan';
import { TransactionPlan } from './transactionPlan';

const TRANSACTION_SIZE_LIMIT =
  1_280 -
  40 /* 40 bytes is the size of the IPv6 header. */ -
  8; /* 8 bytes is the size of the fragment header. */

export type TransactionPlannerConfig = {
  preTransformer?: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage>;
  postTransformer?: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage>;
};

export type TransactionPlanner = (
  instructionPlan: InstructionPlan,
  config?: TransactionPlannerConfig
) => Promise<TransactionPlan>;

export function createBaseTransactionPlanner({
  version,
}: {
  version: TransactionVersion;
}): TransactionPlanner {
  // TODO: Implement
  // - Ask for additional instructions for each message. Maybe `getDefaultMessage` or `messageModifier` functions?
  // - Add Compute Unit instructions.
  // - Split instruction by sizes.
  // - Provide remaining bytes to dynamic instructions.
  // - Pack transaction messages as much as possible.
  // - simulate CU.
  return async (instructionPlan, config) => {
    // Use when starting a new transaction message.
    const startTransactionMessage = async <
      TTransactionMessage extends BaseTransactionMessage,
    >(): Promise<TTransactionMessage> => {
      const transactionMessage = createTransactionMessage({
        version,
      }) as TTransactionMessage;
      return config?.preTransformer
        ? await config.preTransformer(transactionMessage)
        : transactionMessage;
    };

    // Use once the transaction message is fully built.
    // const finishTransactionMessage = async <
    //   TTransactionMessage extends BaseTransactionMessage,
    // >(
    //   transactionMessage: TTransactionMessage
    // ) => {
    //   return config?.postTransformer
    //     ? await config.postTransformer(transactionMessage)
    //     : transactionMessage;
    // };

    // State.
    let finalPlan: TransactionPlan | undefined;
    // let parentPlan: TransactionPlan | undefined;
    let currentTransaction: BaseTransactionMessage | undefined;
    // let remainingTransactionSize: number = 0;

    // Loop.
    const loop = async (plan: InstructionPlan): Promise<void> => {
      if (!currentTransaction) {
        currentTransaction = await startTransactionMessage();
        // remainingTransactionSize = getRemainingTransactionSize(currentTransaction);
      }
      switch (plan.kind) {
        case 'sequential':
          break;
        case 'parallel':
          break;
        case 'dynamic':
          break;
        default:
        case 'single':
          currentTransaction = appendTransactionMessageInstruction(
            plan.instruction,
            currentTransaction
          );
      }
    };

    await loop(instructionPlan);
    return finalPlan as TransactionPlan;
  };
}

export function getRemainingTransactionSize(message: BaseTransactionMessage) {
  return (
    TRANSACTION_SIZE_LIMIT -
    getTransactionSize(message) -
    1 /* Subtract 1 byte buffer to account for shortvec encoding. */
  );
}

function getTransactionSize(
  message: BaseTransactionMessage & Partial<CompilableTransactionMessage>
): number {
  const mockFeePayer = '11111111111111111111111111111111' as Address;
  const mockBlockhash = {
    blockhash: '11111111111111111111111111111111' as Blockhash,
    lastValidBlockHeight: 0n,
  };
  const transaction = pipe(
    message,
    (tx) => {
      return tx.feePayer
        ? (tx as typeof tx & ITransactionMessageWithFeePayer)
        : setTransactionMessageFeePayer(mockFeePayer, tx);
    },
    (tx) => {
      return tx.lifetimeConstraint
        ? (tx as typeof tx & TransactionMessageWithBlockhashLifetime)
        : setTransactionMessageLifetimeUsingBlockhash(mockBlockhash, tx);
    },
    (tx) => compileTransaction(tx)
  );
  return getTransactionEncoder().getSizeFromValue(transaction);
}
