/**
 * TODO: The helpers in this file would need to be a first-class citizen of @solana/transactions.
 */

import {
  Address,
  BaseTransactionMessage,
  Blockhash,
  CompilableTransactionMessage,
  compileTransaction,
  getTransactionEncoder,
  ITransactionMessageWithFeePayer,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionMessageWithBlockhashLifetime,
} from '@solana/kit';

export const TRANSACTION_PACKET_SIZE = 1280;

export const TRANSACTION_PACKET_HEADER =
  40 /* 40 bytes is the size of the IPv6 header. */ +
  8; /* 8 bytes is the size of the fragment header. */

export const TRANSACTION_SIZE_LIMIT =
  TRANSACTION_PACKET_SIZE - TRANSACTION_PACKET_HEADER;

// It should accepts both `Transaction` and `BaseTransactionMessage` instances.
// Over time, efforts should be made to improve the performance of this function.
// E.g. maybe we don't need to compile the transaction message to get the size.
export function getTransactionSize(
  message: BaseTransactionMessage & Partial<CompilableTransactionMessage>
): number {
  const mockFeePayer =
    'Gm1uVH3JxiLgafByNNmnoxLncB7ytpyWNqX3kRM9tSxN' as Address;
  const mockBlockhash = {
    blockhash: '2WCjwT4P5tJF7tjMtTVEnN6o53bcZ8MhszcfXMERtU3z' as Blockhash,
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
