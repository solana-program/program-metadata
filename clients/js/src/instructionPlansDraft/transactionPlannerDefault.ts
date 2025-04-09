import {
  createTransactionMessage as kitCreateTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  TransactionSigner,
} from '@solana/kit';
import { TransactionPlanner } from './transactionPlanner';
import { createBaseTransactionPlannerFactory } from './transactionPlannerFactory';
import { setTransactionMessageLifetimeUsingProvisoryBlockhash } from './transactionHelpers';
import { updateOrPrependProvisorySetComputeUnitLimitInstruction } from './computeBudgetHelpers';

export function createDefaultTransactionPlanner(
  feePayer: TransactionSigner
): TransactionPlanner {
  return createBaseTransactionPlannerFactory()({
    createTransactionMessage: () =>
      pipe(
        kitCreateTransactionMessage({ version: 0 }),
        setTransactionMessageLifetimeUsingProvisoryBlockhash,
        updateOrPrependProvisorySetComputeUnitLimitInstruction,
        (tx) => setTransactionMessageFeePayerSigner(feePayer, tx)
      ),
  });
}
