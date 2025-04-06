import {
  Address,
  appendTransactionMessageInstructions,
  BaseTransactionMessage,
  IInstruction,
  ITransactionMessageWithFeePayer,
  ITransactionMessageWithFeePayerSigner,
  pipe,
  prependTransactionMessageInstructions,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionMessageWithBlockhashLifetime,
  TransactionSigner,
} from '@solana/kit';
import { TransactionPlanner } from './transactionPlanner';

export function transformTransactionPlannerMessage(
  transformer: <TTransactionMessage extends BaseTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => TTransactionMessage,
  planner: TransactionPlanner
): TransactionPlanner {
  return async (instructionPlan, config) => {
    return await planner(instructionPlan, {
      ...config,
      newTransactionTransformer: (transactionMessage) =>
        pipe(transactionMessage, transformer, (tx) =>
          config?.newTransactionTransformer
            ? config.newTransactionTransformer(tx)
            : Promise.resolve(tx)
        ),
    });
  };
}

export function prependTransactionPlannerInstructions(
  instructions: IInstruction[],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    (tx) => prependTransactionMessageInstructions(instructions, tx),
    planner
  );
}

export function appendTransactionPlannerInstructions(
  instructions: IInstruction[],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    planner
  );
}

export function setTransactionPlannerFeePayer(
  feePayer: Address,
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    <TTransactionMessage extends BaseTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      setTransactionMessageFeePayer(feePayer, tx) as TTransactionMessage &
        ITransactionMessageWithFeePayer,
    planner
  );
}

export function setTransactionPlannerFeePayerSigner(
  feePayerSigner: TransactionSigner,
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    <TTransactionMessage extends BaseTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        tx
      ) as TTransactionMessage & ITransactionMessageWithFeePayerSigner,
    planner
  );
}

export function setTransactionPlannerLifetimeUsingBlockhash(
  latestBlockhash: TransactionMessageWithBlockhashLifetime['lifetimeConstraint'],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    planner
  );
}

// TODO: estimateAndSetComputeUnitLimitForTransactionPlanner
