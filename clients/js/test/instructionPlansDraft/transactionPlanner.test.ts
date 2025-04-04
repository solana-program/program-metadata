import test from 'ava';
import { createBaseTransactionPlanner } from '../../src';
import {
  instructionFactory,
  parallelInstructionPlan,
  sequentialInstructionPlan,
  singleInstructionPlan,
  transactionPercentFactory,
} from './_instructionPlanHelpers';
import {
  parallelTransactionPlan,
  sequentialTransactionPlan,
  singleTransactionPlanFactory,
} from './_transactionPlanHelpers';

function defaultFactories() {
  return {
    instruction: instructionFactory(),
    txPercent: transactionPercentFactory(),
    singleTransactionPlan: singleTransactionPlanFactory(),
  };
}

/**
 * [Ix: A] ──────────────▶ [Tx: A]
 */
test('it plans a single instruction', async (t) => {
  const { instruction, singleTransactionPlan } = defaultFactories();
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
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
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
test('it plans a sequential plan with instructions that must be split accross multiple transactions (v1)', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
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
 *         [Seq] ────────────────────────▶ [Seq]
 *       /   |   \                          | |
 * [Ix: A] [Ix: B] [Ix: C]         ┌────────┘ └───────┐
 *                             [Tx: A]          [Tx: B + C]
 */
test('it plans a sequential plan with instructions that must be split accross multiple transactions (v2)', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(60)); // Tx A cannot have Ix B.
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
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB, instructionC]),
    ])
  );
});

/**
 *       [Seq] ──────────────▶ [Tx: A + B]
 *      /     \
 * [Ix: A]   [Seq]
 *             |
 *          [Ix: B]
 */
test('it simplifies nested sequential plans', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
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
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
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
test('it plans a parallel plan with instructions that must be split accross multiple transactions (v1)', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
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
 *         [Par] ────────────────────────▶ [Par]
 *       /   |   \                          | |
 * [Ix: A] [Ix: B] [Ix: C]         ┌────────┘ └───────┐
 *                             [Tx: A]         [Tx: B + C]
 */
test('it plans a parallel plan with instructions that must be split accross multiple transactions (v2)', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(60)); // Tx A cannot have Ix B.
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
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB, instructionC]),
    ])
  );
});

/**
 *       [Par] ──────────────▶ [Tx: A + B]
 *      /     \
 * [Ix: A]   [Par]
 *             |
 *          [Ix: B]
 */
test('it simplifies nested parallel plans', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
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

/**
 *            [Par] ──────────────────────────▶ [Par]
 *          /   |    \                        /      \
 *      [Seq] [Ix: C] [Ix: D]      [Tx: A + B + D]   [Tx: C]
 *      /   \
 * [Ix: A] [Ix: B]
 */
test('it re-uses previous parallel transactions if there is space', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(25));
  const instructionC = instruction(txPercent(90));
  const instructionD = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        sequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        singleInstructionPlan(instructionC),
        singleInstructionPlan(instructionD),
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionA, instructionB, instructionD]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *             [Par] ──────────────▶ [Tx: A + B + C + D]
 *           /       \
 *       [Seq]       [Seq]
 *      /    \       /    \
 * [Ix: A] [Ix: B] [Ix: C] [Ix: D]
 */
test('it can merge sequential plans in a parallel plan if the whole sequential plan fits', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(25));
  const instructionB = instruction(txPercent(25));
  const instructionC = instruction(txPercent(25));
  const instructionD = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        sequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        sequentialInstructionPlan([
          singleInstructionPlan(instructionC),
          singleInstructionPlan(instructionD),
        ]),
      ])
    ),
    singleTransactionPlan([
      instructionA,
      instructionB,
      instructionC,
      instructionD,
    ])
  );
});

/**
 *             [Par] ──────────────────────────▶ [Par]
 *           /       \                          /     \
 *       [Seq]       [Seq]             [Tx: A + B]   [Tx: C + D]
 *      /    \       /    \
 * [Ix: A] [Ix: B] [Ix: C] [Ix: D]
 */
test('it does not split a sequential plan on a parallel parent', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(33));
  const instructionB = instruction(txPercent(33));
  const instructionC = instruction(txPercent(33));
  const instructionD = instruction(txPercent(33));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        sequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        sequentialInstructionPlan([
          singleInstructionPlan(instructionC),
          singleInstructionPlan(instructionD),
        ]),
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC, instructionD]),
    ])
  );
});

/**
 *             [Seq] ──────────────────────────▶ [Seq]
 *           /       \                          /     \
 *       [Par]       [Par]         [Tx: A + B + C]   [Tx: D]
 *      /    \       /    \
 * [Ix: A] [Ix: B] [Ix: C] [Ix: D]
 */
test('it can split parallel plans inside sequential plans as long as they follow the sequence', async (t) => {
  const { instruction, txPercent, singleTransactionPlan } = defaultFactories();
  const planner = createBaseTransactionPlanner({ version: 0 });

  const instructionA = instruction(txPercent(33));
  const instructionB = instruction(txPercent(33));
  const instructionC = instruction(txPercent(33));
  const instructionD = instruction(txPercent(33));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        parallelInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        parallelInstructionPlan([
          singleInstructionPlan(instructionC),
          singleInstructionPlan(instructionD),
        ]),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB, instructionC]),
      singleTransactionPlan([instructionD]),
    ])
  );
});
