import {
  AccountNotificationsApi,
  Commitment,
  compileTransaction,
  FullySignedTransaction,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetSignatureStatusesApi,
  isTransactionMessageWithSingleSendingSigner,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmDurableNonceTransactionFactory,
  sendAndConfirmTransactionFactory,
  SendTransactionApi,
  signAndSendTransactionMessageWithSigners,
  SignatureNotificationsApi,
  signTransactionMessageWithSigners,
  SlotNotificationsApi,
  TransactionWithBlockhashLifetime,
  TransactionWithDurableNonceLifetime,
  TransactionWithLifetime,
} from '@solana/kit';
import { TransactionPlanExecutor } from './transactionPlanExecutor';
import {
  createBaseTransactionPlanExecutor,
  TransactionPlanExecutorSendAndConfirm,
} from './transactionPlanExecutorBase';
import {
  refreshBlockhashForTransactionPlanExecutor,
  retryTransactionPlanExecutor,
} from './transactionPlanExecutorDecorators';

export function createDefaultTransactionPlanExecutor(
  config: SendAndConfirmTransactionFactoryConfig & {
    rpc: Rpc<GetLatestBlockhashApi>;
    commitment?: Commitment;
    parallelChunkSize?: number;
  }
): TransactionPlanExecutor {
  return createBaseTransactionPlanExecutor({
    parallelChunkSize: config.parallelChunkSize,
    sendAndConfirm: pipe(
      getDefaultTransactionPlanExecutorSendAndConfirm({
        ...config,
        commitment: config.commitment ?? 'confirmed',
      }),
      (fn) => refreshBlockhashForTransactionPlanExecutor(config.rpc, fn),
      (fn) => retryTransactionPlanExecutor(3, fn)
    ),
  });
}

function getDefaultTransactionPlanExecutorSendAndConfirm(
  config: SendAndConfirmTransactionFactoryConfig & { commitment: Commitment }
): TransactionPlanExecutorSendAndConfirm {
  const sendAndConfirm = sendAndConfirmTransactionFactoryWithAnyLifetime({
    rpc: config.rpc,
    rpcSubscriptions: config.rpcSubscriptions,
  });
  return async (transactionMessage, executorConfig) => {
    if (isTransactionMessageWithSingleSendingSigner(transactionMessage)) {
      await signAndSendTransactionMessageWithSigners(transactionMessage, {
        abortSignal: executorConfig?.abortSignal,
      });
      return { transaction: compileTransaction(transactionMessage) };
    }

    const transaction =
      await signTransactionMessageWithSigners(transactionMessage);
    await sendAndConfirm(transaction, {
      abortSignal: executorConfig?.abortSignal,
      commitment: config.commitment,
    });

    return { transaction };
  };
}

type SendAndConfirmTransactionFactoryConfig = {
  rpc: Rpc<
    GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi &
      GetAccountInfoApi
  >;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi & AccountNotificationsApi
  >;
};

type SendAndConfirmTransactionFunction = (
  transaction: FullySignedTransaction & TransactionWithLifetime,
  config: { abortSignal?: AbortSignal; commitment: Commitment }
) => Promise<void>;

function sendAndConfirmTransactionFactoryWithAnyLifetime(
  factoryConfig: SendAndConfirmTransactionFactoryConfig
): SendAndConfirmTransactionFunction {
  const sendAndConfirmWithBlockhash =
    sendAndConfirmTransactionFactory(factoryConfig);
  const sendAndConfirmWithDurableNonce =
    sendAndConfirmDurableNonceTransactionFactory(factoryConfig);

  return async (transaction, config) => {
    if (!isBlockhashTransaction(transaction)) {
      return await sendAndConfirmWithDurableNonce(
        transaction as typeof transaction & TransactionWithDurableNonceLifetime,
        config
      );
    }
    return await sendAndConfirmWithBlockhash(transaction, config);
  };
}

function isBlockhashTransaction(
  transaction: TransactionWithLifetime
): transaction is TransactionWithBlockhashLifetime {
  return (
    'lifetimeConstraint' in transaction &&
    'blockhash' in transaction.lifetimeConstraint &&
    'lastValidBlockHeight' in transaction.lifetimeConstraint &&
    typeof transaction.lifetimeConstraint.blockhash === 'string' &&
    typeof transaction.lifetimeConstraint.lastValidBlockHeight === 'bigint'
  );
}
