import test from 'ava';
import { createBaseTransactionPlanner } from '../../src';
import { getSingleInstructionPlanFactory } from './_instructionPlanHelpers';
import { getSingleTransactionPlanFactory } from './_transactionPlanHelpers';

/**
 * [Ix: A] => [Tx: A]
 */
test('it plans a single instruction', async (t) => {
  const singleInstructionPlan = getSingleInstructionPlanFactory();
  const singleTransactionPlan = getSingleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionPlan = singleInstructionPlan(500);
  const transactionPlan = await planner(singleInstructionPlan(500));

  t.deepEqual(
    transactionPlan,
    singleTransactionPlan([instructionPlan.instruction])
  );
});
