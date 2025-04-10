import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  MicroLamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  TransactionSigner,
} from '@solana/kit';
import { TransactionPlanner } from './transactionPlanner';
import { createBaseTransactionPlanner } from './transactionPlannerBase';
import { setTransactionMessageLifetimeUsingProvisoryBlockhash } from './transactionHelpers';
import { fillProvisorySetComputeUnitLimitInstruction } from './computeBudgetHelpers';
import { getSetComputeUnitPriceInstruction } from '@solana-program/compute-budget';

export function createDefaultTransactionPlanner(config: {
  feePayer: TransactionSigner;
  computeUnitPrice?: MicroLamports;
}): TransactionPlanner {
  return createBaseTransactionPlanner({
    createTransactionMessage: () =>
      pipe(
        createTransactionMessage({ version: 0 }),
        setTransactionMessageLifetimeUsingProvisoryBlockhash,
        fillProvisorySetComputeUnitLimitInstruction,
        (tx) => setTransactionMessageFeePayerSigner(config.feePayer, tx),
        (tx) =>
          config.computeUnitPrice
            ? appendTransactionMessageInstruction(
                getSetComputeUnitPriceInstruction({
                  microLamports: config.computeUnitPrice,
                }),
                tx
              )
            : tx
      ),
  });
}
