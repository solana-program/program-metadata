import test from 'ava';
import { createBaseTransactionPlanner } from '../../src';
import {
  instructionFactory,
  singleInstructionPlan,
} from './_instructionPlanHelpers';
import { singleTransactionPlanFactory } from './_transactionPlanHelpers';

/**
 * [Ix: A] => [Tx: A]
 */
test('it plans a single instruction', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(42);
  const transactionPlan = await planner(singleInstructionPlan(instructionA));
  t.deepEqual(transactionPlan, singleTransactionPlan([instructionA]));
});
