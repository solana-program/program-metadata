import test from 'ava';
import { createBaseTransactionPlanner } from '../../src';
import {
  instructionFactory,
  parallelInstructionPlan,
  sequentialInstructionPlan,
  singleInstructionPlan,
  txPercent,
} from './_instructionPlanHelpers';
import {
  parallelTransactionPlan,
  sequentialTransactionPlan,
  singleTransactionPlanFactory,
} from './_transactionPlanHelpers';

/**
 * [Ix: A] ──────────────▶ [Tx: A]
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
 *         [Seq] ──────────────▶ [Tx: A + B]
 *          | |
 *   ┌──────┘ └──────┐
 * [Ix: A]       [Ix: B]
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
 *         [Seq] ────────────────────────▶ [Seq]
 *       /   |   \                          | |
 * [Ix: A] [Ix: B] [Ix: C]         ┌────────┘ └───────┐
 *                             [Tx: A + B]         [Tx: C]
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

/**
 *           [Seq] ──────────────▶ [Tx: A + B]
 *          /     \
 *     [Ix: A]   [Seq]
 *                 |
 *              [Ix: B]
 */
test('it simplifies nested sequential plans', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        sequentialInstructionPlan([singleInstructionPlan(instructionB)]),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *         [Par] ──────────────▶ [Tx: A + B]
 *          | |
 *   ┌──────┘ └──────┐
 * [Ix: A]       [Ix: B]
 */
test('it plans a parallel plan with instructions that all fit in a single transaction', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *         [Par] ────────────────────────▶ [Par]
 *       /   |   \                          | |
 * [Ix: A] [Ix: B] [Ix: C]         ┌────────┘ └───────┐
 *                             [Tx: A + B]         [Tx: C]
 */
test('it plans a parallel plan with instructions that must be split accross multiple transactions', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
        singleInstructionPlan(instructionC),
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *           [Par] ──────────────▶ [Tx: A + B]
 *          /     \
 *     [Ix: A]   [Par]
 *                 |
 *              [Ix: B]
 */
test('it simplifies nested parallel plans', async (t) => {
  const instruction = instructionFactory();
  const singleTransactionPlan = singleTransactionPlanFactory();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        parallelInstructionPlan([singleInstructionPlan(instructionB)]),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});
