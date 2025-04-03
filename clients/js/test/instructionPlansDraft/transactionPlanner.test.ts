import test from 'ava';
import { createBaseTransactionPlanner } from '../../src';
import {
  instructionFactory,
  sequentialInstructionPlan,
  singleInstructionPlan,
  txPercent,
} from './_instructionPlanHelpers';
import {
  sequentialTransactionPlan,
  singleTransactionPlanFactory,
} from './_transactionPlanHelpers';

/**
 * [Ix: A]
 *    │
 *    ▼
 * [Tx: A]
 */
test('it plans a single instruction', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(42);

  t.deepEqual(
    await planner(singleInstructionPlan(instructionA)),
    singleTransactionPlan([instructionA])
  );
});

/**
 *         [Seq]
 *          | |
 *   ┌──────┘ └──────┐
 * [Ix: A]       [Ix: B]
 *          │
 *          ▼
 *      [Tx: A + B]
 */
test('it plans a sequential plan with instructions that all fit in a single transaction', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *         [Seq]
 *       /   |   \
 * [Ix: A] [Ix: B] [Ix: C]
 *           │
 *           ▼
 *         [Seq]
 *          | |
 *   ┌──────┘ └──────┐
 * [Tx: A + B]   [Tx: C]
 */
test('it plans a sequential plan with instructions that must be split accross multiple transactions', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
        singleInstructionPlan(instructionC),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});
