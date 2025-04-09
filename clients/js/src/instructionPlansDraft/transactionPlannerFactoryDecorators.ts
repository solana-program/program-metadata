import {
  Address,
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  GetLatestBlockhashApi,
  IInstruction,
  ITransactionMessageWithFeePayer,
  ITransactionMessageWithFeePayerSigner,
  prependTransactionMessageInstructions,
  Rpc,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionSigner,
} from '@solana/kit';
import { getTimedCacheFunction } from './internal';
import { TransactionPlannerFactory } from './transactionPlannerFactory';

function transformTransactionPlannerNewMessage(
  transformer: <TTransactionMessage extends CompilableTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage> | TTransactionMessage,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return (config) => {
    return plannerFactory({
      ...config,
      createTransactionMessage: async () => {
        const tx = await Promise.resolve(config.createTransactionMessage());
        return await Promise.resolve(transformer(tx));
      },
    });
  };
}

export function prependTransactionPlannerInstructions(
  instructions: IInstruction[],
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    (tx) => prependTransactionMessageInstructions(instructions, tx),
    plannerFactory
  );
}

export function appendTransactionPlannerInstructions(
  instructions: IInstruction[],
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    plannerFactory
  );
}

export function setTransactionPlannerFeePayer(
  feePayer: Address,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    <TTransactionMessage extends CompilableTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      setTransactionMessageFeePayer(feePayer, tx) as TTransactionMessage &
        ITransactionMessageWithFeePayer,
    plannerFactory
  );
}

export function setTransactionPlannerFeePayerSigner(
  feePayerSigner: TransactionSigner,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    <TTransactionMessage extends CompilableTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        tx
      ) as TTransactionMessage & ITransactionMessageWithFeePayerSigner,
    plannerFactory
  );
}

export function setTransactionPlannerLifetimeUsingLatestBlockhash(
  rpc: Rpc<GetLatestBlockhashApi>,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  // Cache the latest blockhash for 60 seconds.
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);

  return transformTransactionPlannerNewMessage(
    async (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(await getBlockhash(), tx),
    plannerFactory
  );
}
