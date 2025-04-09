import {
  createTransactionMessage as kitCreateTransactionMessage,
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
        kitCreateTransactionMessage({ version: 0 }),
        setTransactionMessageLifetimeUsingProvisoryBlockhash,
        fillProvisorySetComputeUnitLimitInstruction,
        (tx) => setTransactionMessageFeePayerSigner(feePayer, tx)
      ),
  });
}
