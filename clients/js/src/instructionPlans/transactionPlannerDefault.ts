import {
  createTransactionMessage,
  MicroLamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  TransactionSigner,
} from '@solana/kit';
import {
  fillProvisorySetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from './computeBudgetHelpers';
import { setTransactionMessageLifetimeUsingProvisoryBlockhash } from './transactionHelpers';
import { TransactionPlanner } from './transactionPlanner';
import { createBaseTransactionPlanner } from './transactionPlannerBase';

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
            ? setTransactionMessageComputeUnitPrice(config.computeUnitPrice, tx)
            : tx
      ),
  });
}
