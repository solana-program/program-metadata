import test from 'ava';
import {
  instructionFactory,
  instructionIteratorFactory,
  nonDivisibleSequentialInstructionPlan,
  parallelInstructionPlan,
  sequentialInstructionPlan,
  singleInstructionPlan,
  transactionPercentFactory,
} from './_instructionPlanHelpers';
import {
  getMockCreateTransactionMessage,
  nonDivisibleSequentialTransactionPlan,
  parallelTransactionPlan,
  sequentialTransactionPlan,
  singleTransactionPlanFactory,
} from './_transactionPlanHelpers';
import { createBaseTransactionPlannerFactory } from '../../src';
import { CompilableTransactionMessage } from '@solana/kit';

function defaultFactories(
  createTransactionMessage?: () => CompilableTransactionMessage
) {
  const effectiveCreateTransactionMessage =
    createTransactionMessage ?? getMockCreateTransactionMessage;
  return {
    createPlanner: () =>
      createBaseTransactionPlannerFactory()({
        createTransactionMessage: () =>
          Promise.resolve(effectiveCreateTransactionMessage()),
      }),
    instruction: instructionFactory(),
    iterator: instructionIteratorFactory(),
    txPercent: transactionPercentFactory(effectiveCreateTransactionMessage),
    singleTransactionPlan: singleTransactionPlanFactory(
      effectiveCreateTransactionMessage
    ),
  };
}

/**
 *  [A: 42] ───────────────────▶ [Tx: A]
 */
test('it plans a single instruction', async (t) => {
  const { createPlanner, instruction, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(42);

  t.deepEqual(
    await planner(singleInstructionPlan(instructionA)),
    singleTransactionPlan([instructionA])
  );
});

/**
 *  [Seq] ───────────────────▶ [Tx: A + B]
 *   │
 *   ├── [A: 50%]
 *   └── [B: 50%]
 */
test('it plans a sequential plan with instructions that all fit in a single transaction', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Seq] ───────────────────▶ [Seq]
 *   │                          │
 *   ├── [A: 50%]               ├── [Tx: A + B]
 *   ├── [B: 50%]               └── [Tx: C]
 *   └── [C: 50%]
 */
test('it plans a sequential plan with instructions that must be split accross multiple transactions (v1)', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Seq] ───────────────────▶ [Seq]
 *   │                          │
 *   ├── [A: 60%]               ├── [Tx: A]
 *   ├── [B: 50%]               └── [Tx: B + C]
 *   └── [C: 50%]
 */
test('it plans a sequential plan with instructions that must be split accross multiple transactions (v2)', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Seq] ───────────────────▶ [Tx: A + B]
 *   │
 *   ├── [A: 50%]
 *   ├── [Seq]
 *   └── [Seq]
 *        └── [B: 50%]
 */
test('it simplifies sequential plans with one child or less', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        sequentialInstructionPlan([]),
        sequentialInstructionPlan([singleInstructionPlan(instructionB)]),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *  [Seq] ──────────────────────▶ [Seq]
 *   │                             │
 *   ├── [A: 100%]                 ├── [Tx: A]
 *   └── [Seq]                     ├── [Tx: B]
 *        ├── [B: 100%]            └── [Tx: C]
 *        └── [C: 100%]
 */
test('it simplifies nested sequential plans', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(100));
  const instructionB = instruction(txPercent(100));
  const instructionC = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        sequentialInstructionPlan([
          singleInstructionPlan(instructionB),
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *  [Par] ───────────────────▶ [Tx: A + B]
 *   │
 *   ├── [A: 50%]
 *   └── [B: 50%]
 */
test('it plans a parallel plan with instructions that all fit in a single transaction', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Par] ───────────────────▶ [Par]
 *   │                          │
 *   ├── [A: 50%]               ├── [Tx: A + B]
 *   ├── [B: 50%]               └── [Tx: C]
 *   └── [C: 50%]
 */
test('it plans a parallel plan with instructions that must be split accross multiple transactions (v1)', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Par] ───────────────────▶ [Par]
 *   │                          │
 *   ├── [A: 60%]               ├── [Tx: A]
 *   ├── [B: 50%]               └── [Tx: B + C]
 *   └── [C: 50%]
 */
test('it plans a parallel plan with instructions that must be split accross multiple transactions (v2)', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Par] ───────────────────▶ [Tx: A + B]
 *   │
 *   ├── [A: 50%]
 *   ├── [Par]
 *   └── [Par]
 *        └── [B: 50%]
 */
test('it simplifies parallel plans with one child or less', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        parallelInstructionPlan([]),
        parallelInstructionPlan([singleInstructionPlan(instructionB)]),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *  [Par] ──────────────────────▶ [Par]
 *   │                             │
 *   ├── [A: 100%]                 ├── [Tx: A]
 *   └── [Par]                     ├── [Tx: B]
 *        ├── [B: 100%]            └── [Tx: C]
 *        └── [C: 100%]
 */
test('it simplifies nested parallel plans', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(100));
  const instructionB = instruction(txPercent(100));
  const instructionC = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        parallelInstructionPlan([
          singleInstructionPlan(instructionB),
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *  [Par] ───────────────────▶ [Par]
 *   │                          │
 *   ├── [Seq]                  ├── [Tx: A + B + D]
 *   │    ├── [A: 50%]          └── [Tx: C]
 *   │    └── [B: 25%]
 *   ├── [C: 90%]
 *   └── [D: 25%]
 */
test('it re-uses previous parallel transactions if there is space', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Par] ───────────────────▶ [Tx: A + B + C + D]
 *   │
 *   ├── [Seq]
 *   │    ├── [A: 25%]
 *   │    └── [B: 25%]
 *   └── [Seq]
 *        ├── [C: 25%]
 *        └── [D: 25%]
 */
test('it can merge sequential plans in a parallel plan if the whole sequential plan fits', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Par] ───────────────────▶ [Par]
 *   │                          │
 *   ├── [Seq]                  ├── [Tx: A + B]
 *   │    ├── [A: 33%]          └── [Tx: C + D]
 *   │    └── [B: 33%]
 *   └── [Seq]
 *        ├── [C: 33%]
 *        └── [D: 33%]
 */
test('it does not split a sequential plan on a parallel parent', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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
 *  [Seq] ───────────────────▶ [Seq]
 *   │                          │
 *   ├── [Par]                  ├── [Tx: A + B + C]
 *   │    ├── [A: 33%]          └── [Tx: D]
 *   │    └── [B: 33%]
 *   └── [Par]
 *        ├── [C: 33%]
 *        └── [D: 33%]
 */
test('it can split parallel plans inside sequential plans as long as they follow the sequence', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

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

/**
 *  [Seq] ───────────────────▶ [Seq]
 *   │                          │
 *   ├── [Par]                  ├── [Tx: A + B]
 *   │    ├── [A: 33%]          ├── [Tx: C + D]
 *   │    └── [B: 33%]          └── [Tx: E + F]
 *   ├── [Par]
 *   │    ├── [C: 50%]
 *   │    └── [D: 50%]
 *   └── [Par]
 *         ├── [E: 33%]
 *         └── [F: 33%]
 */
test('it cannnot split a parallel plan in a sequential plan if that would break the sequence', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(33));
  const instructionB = instruction(txPercent(33));
  const instructionC = instruction(txPercent(50));
  const instructionD = instruction(txPercent(50));
  const instructionE = instruction(txPercent(33));
  const instructionF = instruction(txPercent(33));

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
        parallelInstructionPlan([
          singleInstructionPlan(instructionE),
          singleInstructionPlan(instructionF),
        ]),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC, instructionD]),
      singleTransactionPlan([instructionE, instructionF]),
    ])
  );
});

/**
 *  [NonDivSeq] ───────────────────▶ [Tx: A + B]
 *   │
 *   ├── [A: 50%]
 *   └── [B: 50%]
 */
test('it plans an non-divisible sequential plan with instructions that all fit in a single transaction', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *  [NonDivSeq] ─────────────▶ [NonDivSeq]
 *   │                          │
 *   ├── [A: 50%]               ├── [Tx: A + B]
 *   ├── [B: 50%]               └── [Tx: C]
 *   └── [C: 50%]
 */
test('it plans a non-divisible sequential plan with instructions that must be split accross multiple transactions (v1)', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
        singleInstructionPlan(instructionC),
      ])
    ),
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *  [NonDivSeq] ─────────────▶ [NonDivSeq]
 *   │                          │
 *   ├── [A: 60%]               ├── [Tx: A]
 *   ├── [B: 50%]               └── [Tx: B + C]
 *   └── [C: 50%]
 */
test('it plans a non-divisible sequential plan with instructions that must be split accross multiple transactions (v2)', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(60)); // Tx A cannot have Ix B.
  const instructionB = instruction(txPercent(50));
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
        singleInstructionPlan(instructionC),
      ])
    ),
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB, instructionC]),
    ])
  );
});

/**
 *  [NonDivSeq] ─────────────▶ [Tx: A + B]
 *   │
 *   ├── [A: 50%]
 *   ├── [NonDivSeq]
 *   └── [NonDivSeq]
 *        └── [B: 50%]
 */
test('it simplifies non-divisible sequential plans with one child or less', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        nonDivisibleSequentialInstructionPlan([]),
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionB),
        ]),
      ])
    ),
    singleTransactionPlan([instructionA, instructionB])
  );
});

/**
 *  [NonDivSeq] ────────────────▶ [NonDivSeq]
 *   │                             │
 *   ├── [A: 100%]                 ├── [Tx: A]
 *   └── [NonDivSeq]               ├── [Tx: B]
 *        ├── [B: 100%]            └── [Tx: C]
 *        └── [C: 100%]
 */
test('it simplifies nested non-divisible sequential plans', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(100));
  const instructionB = instruction(txPercent(100));
  const instructionC = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionB),
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *  [NonDivSeq] ────────────────▶ [NonDivSeq]
 *   │                             │
 *   ├── [A: 100%]                 ├── [Tx: A]
 *   └── [Seq]                     ├── [Tx: B]
 *        ├── [B: 100%]            └── [Tx: C]
 *        └── [C: 100%]
 */
test('it simplifies divisible sequential plans inside non-divisible sequential plans', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(100));
  const instructionB = instruction(txPercent(100));
  const instructionC = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        sequentialInstructionPlan([
          singleInstructionPlan(instructionB),
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA]),
      singleTransactionPlan([instructionB]),
      singleTransactionPlan([instructionC]),
    ])
  );
});

/**
 *  [Seq] ──────────────────────▶ [Seq]
 *   │                             │
 *   ├── [A: 100%]                 ├── [Tx: A]
 *   └── [NonDivSeq]               └── [NonDivSeq]
 *        ├── [B: 100%]                 ├── [Tx: B]
 *        └── [C: 100%]                 └── [Tx: C]
 */
test('it does not simplify non-divisible sequential plans inside divisible sequential plans', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(100));
  const instructionB = instruction(txPercent(100));
  const instructionC = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionB),
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA]),
      nonDivisibleSequentialTransactionPlan([
        singleTransactionPlan([instructionB]),
        singleTransactionPlan([instructionC]),
      ]),
    ])
  );
});

/**
 *  [Par] ───────────────────▶ [Tx: A + B + C + D]
 *   │
 *   ├── [NonDivSeq]
 *   │    ├── [A: 25%]
 *   │    └── [B: 25%]
 *   └── [NonDivSeq]
 *        ├── [C: 25%]
 *        └── [D: 25%]
 */
test('it can merge non-divisible sequential plans in a parallel plan if the whole sequential plan fits', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(25));
  const instructionB = instruction(txPercent(25));
  const instructionC = instruction(txPercent(25));
  const instructionD = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        nonDivisibleSequentialInstructionPlan([
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
 *  [Par] ───────────────────▶ [Par]
 *   │                          │
 *   ├── [NonDivSeq]            ├── [Tx: A + B]
 *   │    ├── [A: 33%]          └── [Tx: C + D]
 *   │    └── [B: 33%]
 *   └── [NonDivSeq]
 *        ├── [C: 33%]
 *        └── [D: 33%]
 */
test('it does not split a non-divisible sequential plan on a parallel parent', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(33));
  const instructionB = instruction(txPercent(33));
  const instructionC = instruction(txPercent(33));
  const instructionD = instruction(txPercent(33));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        nonDivisibleSequentialInstructionPlan([
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
 *  [Seq] ───────────────────▶ [Tx: A + B + C + D]
 *   │
 *   ├── [NonDivSeq]
 *   │    ├── [A: 25%]
 *   │    └── [B: 25%]
 *   └── [NonDivSeq]
 *        ├── [C: 25%]
 *        └── [D: 25%]
 */
test('it can merge non-divisible sequential plans in a sequential plan if the whole plan fits', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(25));
  const instructionB = instruction(txPercent(25));
  const instructionC = instruction(txPercent(25));
  const instructionD = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        nonDivisibleSequentialInstructionPlan([
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
 *  [Seq] ───────────────────▶ [Seq]
 *   │                          │
 *   ├── [NonDivSeq]            ├── [Tx: A + B]
 *   │    ├── [A: 33%]          └── [Tx: C + D]
 *   │    └── [B: 33%]
 *   └── [NonDivSeq]
 *        ├── [C: 33%]
 *        └── [D: 33%]
 */
test('it does not split a non-divisible sequential plan on a sequential parent', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(33));
  const instructionB = instruction(txPercent(33));
  const instructionC = instruction(txPercent(33));
  const instructionD = instruction(txPercent(33));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionC),
          singleInstructionPlan(instructionD),
        ]),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC, instructionD]),
    ])
  );
});

/**
 *  [NonDivSeq] ─────────────▶ [NonDivSeq]
 *   │                          │
 *   ├── [Par]                  ├── [Tx: A + B]
 *   │    ├── [A: 50%]          └── [Par]
 *   │    └── [B: 50%]               ├── [Tx: C]
 *   └── [Par]                       └── [Tx: D]
 *        ├── [C: 100%]
 *        └── [D: 100%]
 */
test('it plans non-divisible sequentials plans with parallel children', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));
  const instructionC = instruction(txPercent(100));
  const instructionD = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
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
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      parallelTransactionPlan([
        singleTransactionPlan([instructionC]),
        singleTransactionPlan([instructionD]),
      ]),
    ])
  );
});

/**
 *  [NonDivSeq] ─────────────▶ [NonDivSeq]
 *   │                          │
 *   ├── [Seq]                  ├── [Tx: A + B]
 *   │    ├── [A: 50%]          ├── [Tx: C]
 *   │    └── [B: 50%]          └── [Tx: D]
 *   └── [Seq]
 *        ├── [C: 100%]
 *        └── [D: 100%]
 */
test('it plans non-divisible sequentials plans with divisible sequential children', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const instructionB = instruction(txPercent(50));
  const instructionC = instruction(txPercent(100));
  const instructionD = instruction(txPercent(100));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
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
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      singleTransactionPlan([instructionC]),
      singleTransactionPlan([instructionD]),
    ])
  );
});

/**
 *  [A(x, 250%)] ─────────────▶ [Seq]
 *                               │
 *                               ├── [Tx: A(1, 100%)]
 *                               ├── [Tx: A(2, 100%)]
 *                               └── [Tx: A(3, 50%)]
 */
test('it iterate over iterable instruction plans', async (t) => {
  const { createPlanner, txPercent, iterator, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const iteratorIx = iterator(txPercent(250));

  t.deepEqual(
    await planner(iteratorIx),
    sequentialTransactionPlan([
      singleTransactionPlan([iteratorIx.get(txPercent(100), 0)]),
      singleTransactionPlan([iteratorIx.get(txPercent(100), 1)]),
      singleTransactionPlan([iteratorIx.get(txPercent(50), 2)]),
    ])
  );
});

/**
 *  [Seq] ───────────────────▶ [Tx: A + B(1, 50%)]
 *   │
 *   ├── [A: 50%]
 *   └── [B(x, 50%)]
 */
test('it combines single instruction plans with iterable instruction plans', async (t) => {
  const {
    createPlanner,
    txPercent,
    iterator,
    instruction,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(50));
  const iteratorB = iterator(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        iteratorB,
      ])
    ),
    singleTransactionPlan([instructionA, iteratorB.get(txPercent(50), 0)])
  );
});

/**
 *  [Par] ────────────────────▶ [Par]
 *   │                           │
 *   └── [A(x, 250%)]            ├── [Tx: A(1, 100%)]
 *                               ├── [Tx: A(2, 100%)]
 *                               └── [Tx: A(3, 50%)]
 */
test('it can handle parallel iterable instruction plans', async (t) => {
  const { createPlanner, txPercent, iterator, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const iteratorA = iterator(txPercent(250));

  t.deepEqual(
    await planner(parallelInstructionPlan([iteratorA])),
    parallelTransactionPlan([
      singleTransactionPlan([iteratorA.get(txPercent(100), 0)]),
      singleTransactionPlan([iteratorA.get(txPercent(100), 1)]),
      singleTransactionPlan([iteratorA.get(txPercent(50), 2)]),
    ])
  );
});

/**
 *  [NonDivSeq] ──────────────▶ [NonDivSeq]
 *   │                           │
 *   └── [A(x, 250%)]            ├── [Tx: A(1, 100%)]
 *                               ├── [Tx: A(2, 100%)]
 *                               └── [Tx: A(3, 50%)]
 */
test('it can handle non-divisible sequential iterable instruction plans', async (t) => {
  const { createPlanner, txPercent, iterator, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const iteratorA = iterator(txPercent(250));

  t.deepEqual(
    await planner(nonDivisibleSequentialInstructionPlan([iteratorA])),
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([iteratorA.get(txPercent(100), 0)]),
      singleTransactionPlan([iteratorA.get(txPercent(100), 1)]),
      singleTransactionPlan([iteratorA.get(txPercent(50), 2)]),
    ])
  );
});

/**
 *  [A(x, 100%)] ─────────────▶ [Tx: A(1, 100%)]
 */
test('it simplifies iterable instruction plans that fit in a single transaction', async (t) => {
  const { createPlanner, txPercent, iterator, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const iteratorA = iterator(txPercent(100));

  t.deepEqual(
    await planner(iteratorA),
    singleTransactionPlan([iteratorA.get(txPercent(100), 0)])
  );
});

/**
 *  [Par] ─────────────────────▶ [Par]
 *   │                            │
 *   ├── [A: 75%]                 ├── [Tx: A + C(1, 25%)]
 *   ├── [B: 50%]                 ├── [Tx: B + C(2, 50%)]
 *   └── [C(x, 125%)]             └── [Tx: C(3, 50%)]
 */
test('it uses iterable instruction plans to fill gaps in parallel candidates', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(75));
  const instructionB = instruction(txPercent(50));
  const iteratorC = iterator(txPercent(25) + txPercent(50) + txPercent(50)); // 125%

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        singleInstructionPlan(instructionB),
        iteratorC,
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionA, iteratorC.get(txPercent(25), 0)]),
      singleTransactionPlan([instructionB, iteratorC.get(txPercent(50), 1)]),
      singleTransactionPlan([iteratorC.get(txPercent(50), 2)]),
    ])
  );
});

/**
 *  [Par] ─────────────────────▶ [Par]
 *   │                            │
 *   ├── [A(x, 125%)]             ├── [Tx: B + A(1, 25%)]
 *   ├── [C: 50%]                 ├── [Tx: C + A(2, 50%)]
 *   └── [B: 75%]                 └── [Tx: A(3, 50%)]
 */
test('it handles parallel iterable instruction plans last to fill gaps in previous parallel candidates', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const iteratorA = iterator(txPercent(25) + txPercent(50) + txPercent(50)); // 125%
  const instructionB = instruction(txPercent(75));
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        iteratorA,
        singleInstructionPlan(instructionB),
        singleInstructionPlan(instructionC),
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionB, iteratorA.get(txPercent(25), 0)]),
      singleTransactionPlan([instructionC, iteratorA.get(txPercent(50), 1)]),
      singleTransactionPlan([iteratorA.get(txPercent(50), 2)]),
    ])
  );
});

/**
 *  [Seq] ─────────────────────▶ [Seq]
 *   │                            │
 *   ├── [A: 75%]                 ├── [Tx: A + B(1, 25%)]
 *   ├── [B(x, 75%)]              └── [Tx: B(2, 50%) + C]
 *   └── [C: 50%]
 */
test('it uses iterable instruction plans to fill gaps in sequential candidates', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(75));
  const iteratorB = iterator(txPercent(25) + txPercent(50)); // 75%
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        iteratorB,
        singleInstructionPlan(instructionC),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA, iteratorB.get(txPercent(25), 0)]),
      singleTransactionPlan([iteratorB.get(txPercent(50), 1), instructionC]),
    ])
  );
});

/**
 *  [NonDivSeq] ───────────────▶ [NonDivSeq]
 *   │                            │
 *   ├── [A: 75%]                 ├── [Tx: A + B(1, 25%)]
 *   ├── [B(x, 75%)]              └── [Tx: B(2, 50%) + C]
 *   └── [C: 50%]
 */
test('it uses iterable instruction plans to fill gaps in non-divisible sequential candidates', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(75));
  const iteratorB = iterator(txPercent(25) + txPercent(50)); // 75%
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      nonDivisibleSequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        iteratorB,
        singleInstructionPlan(instructionC),
      ])
    ),
    nonDivisibleSequentialTransactionPlan([
      singleTransactionPlan([instructionA, iteratorB.get(txPercent(25), 0)]),
      singleTransactionPlan([iteratorB.get(txPercent(50), 1), instructionC]),
    ])
  );
});

/**
 *  [Seq] ───────────────────────▶ [Seq]
 *   │                              │
 *   ├── [A: 75%]                   ├── [Tx: A + B(1, 25%)]
 *   └── [Par]                      └── [Tx: C + B(2, 50%)]
 *        ├── [B(x, 75%)]
 *        └── [C: 50%]
 */
test('it uses parallel iterable instruction plans to fill gaps in sequential candidates', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(75));
  const iteratorB = iterator(txPercent(25) + txPercent(50)); // 75%
  const instructionC = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        parallelInstructionPlan([
          iteratorB,
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([instructionA, iteratorB.get(txPercent(25), 0)]),
      singleTransactionPlan([instructionC, iteratorB.get(txPercent(50), 1)]),
    ])
  );
});

/**
 *  [Par] ─────────────────────────▶ [Tx: A + B(1, 50%) + C]
 *   │
 *   ├── [A: 25%]
 *   └── [Seq]
 *        ├── [B(x, 50%)]
 *        └── [C: 25%]
 */
test('it uses the whole sequential iterable instruction plan when it fits in the parent parallel candidate', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(25));
  const iteratorB = iterator(txPercent(50));
  const instructionC = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        singleInstructionPlan(instructionA),
        sequentialInstructionPlan([
          iteratorB,
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    singleTransactionPlan([
      instructionA,
      iteratorB.get(txPercent(50), 0),
      instructionC,
    ])
  );
});

/**
 *  [Seq] ─────────────────────────▶ [Tx: A + B(1, 50%) + C]
 *   │
 *   ├── [A: 25%]
 *   └── [NonDivSeq]
 *        ├── [B(x, 50%)]
 *        └── [C: 25%]
 */
test('it uses the whole non-divisible sequential iterable instruction plan when it fits in the parent sequential candidate', async (t) => {
  const {
    createPlanner,
    txPercent,
    instruction,
    iterator,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(25));
  const iteratorB = iterator(txPercent(50));
  const instructionC = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        nonDivisibleSequentialInstructionPlan([
          iteratorB,
          singleInstructionPlan(instructionC),
        ]),
      ])
    ),
    singleTransactionPlan([
      instructionA,
      iteratorB.get(txPercent(50), 0),
      instructionC,
    ])
  );
});

/**
 *  [Par] ───────────────────────────▶ [Par]
 *   │                                 │
 *   ├── [Seq]                         ├── [Tx: A + B]
 *   │    ├── [A: 40%]                 └── [NonDivSeq]
 *   │    └── [B: 40%]                      ├── [Tx: C + D + E + G]
 *   ├── [NonDivSeq]                        └── [Tx: F]
 *   │    ├── [Par]
 *   │    │    ├── [C: 25%]
 *   │    │    └── [D: 25%]
 *   │    └── [Par]
 *   │         ├── [E: 25%]
 *   │         └── [F: 50%]
 *   └── [G: 25%]
 */
test('complex example 1', async (t) => {
  const { createPlanner, instruction, txPercent, singleTransactionPlan } =
    defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(40));
  const instructionB = instruction(txPercent(40));
  const instructionC = instruction(txPercent(25));
  const instructionD = instruction(txPercent(25));
  const instructionE = instruction(txPercent(25));
  const instructionF = instruction(txPercent(50));
  const instructionG = instruction(txPercent(25));

  t.deepEqual(
    await planner(
      parallelInstructionPlan([
        sequentialInstructionPlan([
          singleInstructionPlan(instructionA),
          singleInstructionPlan(instructionB),
        ]),
        nonDivisibleSequentialInstructionPlan([
          parallelInstructionPlan([
            singleInstructionPlan(instructionC),
            singleInstructionPlan(instructionD),
          ]),
          parallelInstructionPlan([
            singleInstructionPlan(instructionE),
            singleInstructionPlan(instructionF),
          ]),
        ]),
        singleInstructionPlan(instructionG),
      ])
    ),
    parallelTransactionPlan([
      singleTransactionPlan([instructionA, instructionB]),
      nonDivisibleSequentialTransactionPlan([
        singleTransactionPlan([
          instructionC,
          instructionD,
          instructionE,
          instructionG,
        ]),
        singleTransactionPlan([instructionF]),
      ]),
    ])
  );
});

/**
 *  [Seq] ─────────────────────────────────▶ [Seq]
 *   │                                        │
 *   ├── [A: 20%]                             ├── [Tx: A + B + C + E(1, 40%)]
 *   ├── [NonDivSeq]                          ├── [Par]
 *   │    ├── [B: 20%]                        │    ├── [Tx: D + E(2, 50%)]
 *   │    └── [C: 20%]                        │    ├── [Tx: E(3, 100%)]
 *   ├── [Par]                                │    └── [Tx: E(4, 60%)]
 *   │    ├── [D: 50%]                        └── [Tx: F + G]
 *   │    └── [E(x, 250%)]
 *   ├── [F: 50%]
 *   └── [G: 50%]
 */
test('complex example 2', async (t) => {
  const {
    createPlanner,
    instruction,
    iterator,
    txPercent,
    singleTransactionPlan,
  } = defaultFactories();
  const planner = createPlanner();

  const instructionA = instruction(txPercent(20));
  const instructionB = instruction(txPercent(20));
  const instructionC = instruction(txPercent(20));
  const instructionD = instruction(txPercent(50));
  const iteratorE = iterator(txPercent(250));
  const instructionF = instruction(txPercent(50));
  const instructionG = instruction(txPercent(50));

  t.deepEqual(
    await planner(
      sequentialInstructionPlan([
        singleInstructionPlan(instructionA),
        nonDivisibleSequentialInstructionPlan([
          singleInstructionPlan(instructionB),
          singleInstructionPlan(instructionC),
        ]),
        parallelInstructionPlan([
          singleInstructionPlan(instructionD),
          iteratorE,
        ]),
        singleInstructionPlan(instructionF),
        singleInstructionPlan(instructionG),
      ])
    ),
    sequentialTransactionPlan([
      singleTransactionPlan([
        instructionA,
        instructionB,
        instructionC,
        iteratorE.get(txPercent(40) - 3, 0),
      ]),
      parallelTransactionPlan([
        singleTransactionPlan([instructionD, iteratorE.get(txPercent(50), 1)]),
        singleTransactionPlan([iteratorE.get(txPercent(100), 2)]),
        singleTransactionPlan([iteratorE.get(txPercent(60) + 3, 3)]),
      ]),
      singleTransactionPlan([instructionF, instructionG]),
    ])
  );
});
