/**
 * TODO: The helpers in this file would need to be a first-class citizen of @solana/transactions.
 */

import {
  BaseTransactionMessage,
  Blockhash,
  CompilableTransactionMessage,
  compileTransaction,
  getTransactionEncoder,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionMessageWithBlockhashLifetime,
} from '@solana/kit';

export const TRANSACTION_PACKET_SIZE = 1280;

export const TRANSACTION_PACKET_HEADER =
  40 /* 40 bytes is the size of the IPv6 header. */ +
  8; /* 8 bytes is the size of the fragment header. */

export const TRANSACTION_SIZE_LIMIT =
  TRANSACTION_PACKET_SIZE - TRANSACTION_PACKET_HEADER;

// It should accepts both `Transaction` and `CompilableTransactionMessage` instances.
// Over time, efforts should be made to improve the performance of this function.
// E.g. maybe we don't need to compile the transaction message to get the size.
export function getTransactionSize(
  message: CompilableTransactionMessage
): number {
  const transaction = compileTransaction(message);
  return getTransactionEncoder().getSizeFromValue(transaction);
}

const PROVISORY_BLOCKHASH_LIFETIME_CONSTRAINT: TransactionMessageWithBlockhashLifetime['lifetimeConstraint'] =
  {
    blockhash: '11111111111111111111111111111111' as Blockhash,
    lastValidBlockHeight: 0n,
  };

export function setTransactionMessageLifetimeUsingProvisoryBlockhash<
  TTransactionMessage extends BaseTransactionMessage,
>(transactionMessage: TTransactionMessage) {
  return setTransactionMessageLifetimeUsingBlockhash(
    PROVISORY_BLOCKHASH_LIFETIME_CONSTRAINT,
    transactionMessage
  );
}
