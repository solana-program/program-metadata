import {
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  TransactionSigner,
} from '@solana/kit';
import { TransactionPlanner } from './transactionPlanner';
import { createBaseTransactionPlanner } from './transactionPlannerBase';
import { setTransactionMessageLifetimeUsingProvisoryBlockhash } from './transactionHelpers';
import { fillProvisorySetComputeUnitLimitInstruction } from './computeBudgetHelpers';

export function createDefaultTransactionPlanner(
  feePayer: TransactionSigner
): TransactionPlanner {
  return createBaseTransactionPlanner({
    createTransactionMessage: () =>
      pipe(
        createTransactionMessage({ version: 0 }),
        setTransactionMessageLifetimeUsingProvisoryBlockhash,
        fillProvisorySetComputeUnitLimitInstruction,
        (tx) => setTransactionMessageFeePayerSigner(feePayer, tx)
      ),
  });
}
