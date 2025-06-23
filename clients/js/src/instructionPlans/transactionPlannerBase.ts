import {
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  IInstruction,
} from '@solana/kit';
import {
  InstructionIterator,
  InstructionPlan,
  IterableInstructionPlan,
  ParallelInstructionPlan,
  SequentialInstructionPlan,
  SingleInstructionPlan,
} from './instructionPlan';
import { Mutable } from './internal';
import {
  getTransactionSize,
  TRANSACTION_SIZE_LIMIT,
} from './transactionHelpers';
import {
  getAllSingleTransactionPlans,
  nonDivisibleSequentialTransactionPlan,
  parallelTransactionPlan,
  sequentialTransactionPlan,
  singleTransactionPlan,
  SingleTransactionPlan,
  TransactionPlan,
} from './transactionPlan';
import { TransactionPlanner } from './transactionPlanner';

export type TransactionPlannerConfig = {
  createTransactionMessage: (config?: {
    abortSignal?: AbortSignal;
  }) => Promise<CompilableTransactionMessage> | CompilableTransactionMessage;
  onTransactionMessageUpdated?: <
    TTransactionMessage extends CompilableTransactionMessage,
  >(
    transactionMessage: TTransactionMessage,
    config?: { abortSignal?: AbortSignal }
  ) => Promise<TTransactionMessage> | TTransactionMessage;
};

export function createBaseTransactionPlanner(
  config: TransactionPlannerConfig
): TransactionPlanner {
  return async (
    originalInstructionPlan,
    { abortSignal } = {}
  ): Promise<TransactionPlan> => {
    const createSingleTransactionPlan: CreateSingleTransactionPlanFunction =
      async () => {
        abortSignal?.throwIfAborted();
        return {
          kind: 'single',
          message: await Promise.resolve(
            config.createTransactionMessage({ abortSignal })
          ),
        };
      };

    const emitSingleTransactionPlanUpdated: EmitSingleTransactionPlanUpdatedFunction =
      async (plan) => {
        abortSignal?.throwIfAborted();
        if (!config?.onTransactionMessageUpdated) return;
        plan.message = await Promise.resolve(
          config.onTransactionMessageUpdated(plan.message, { abortSignal })
        );
      };

    const plan = await traverse(originalInstructionPlan, {
      abortSignal,
      parent: null,
      parentCandidates: [],
      createSingleTransactionPlan,
      emitSingleTransactionPlanUpdated,
    });

    if (!plan) {
      throw new Error('No instructions were found in the instruction plan.');
    }

    if (!isValidTransactionPlan(plan)) {
      // TODO: Coded error.
      const error = new Error(
        'Instruction plan results in invalid transaction plan'
      ) as Error & { plan: TransactionPlan };
      error.plan = plan;
      throw error;
    }

    return freezeTransactionPlan(plan);
  };
}

type MutableTransactionPlan = Mutable<TransactionPlan>;
type MutableSingleTransactionPlan = Mutable<SingleTransactionPlan>;

type CreateSingleTransactionPlanFunction =
  () => Promise<MutableSingleTransactionPlan>;

type EmitSingleTransactionPlanUpdatedFunction = (
  plan: MutableSingleTransactionPlan
) => Promise<void>;

type TraverseContext = {
  abortSignal?: AbortSignal;
  parent: InstructionPlan | null;
  parentCandidates: MutableSingleTransactionPlan[];
  createSingleTransactionPlan: CreateSingleTransactionPlanFunction;
  emitSingleTransactionPlanUpdated: EmitSingleTransactionPlanUpdatedFunction;
};

async function traverse(
  instructionPlan: InstructionPlan,
  context: TraverseContext
): Promise<MutableTransactionPlan | null> {
  context.abortSignal?.throwIfAborted();
  switch (instructionPlan.kind) {
    case 'sequential':
      return await traverseSequential(instructionPlan, context);
    case 'parallel':
      return await traverseParallel(instructionPlan, context);
    case 'single':
      return await traverseSingle(instructionPlan, context);
    case 'iterable':
      return await traverseIterable(instructionPlan, context);
    default:
      instructionPlan satisfies never;
      throw new Error(
        `Unknown instruction plan kind: ${(instructionPlan as { kind: string }).kind}`
      );
  }
}

async function traverseSequential(
  instructionPlan: SequentialInstructionPlan,
  context: TraverseContext
): Promise<MutableTransactionPlan | null> {
  let candidate: MutableSingleTransactionPlan | null = null;
  const mustEntirelyFitInParentCandidate =
    context.parent &&
    (context.parent.kind === 'parallel' || !instructionPlan.divisible);
  if (mustEntirelyFitInParentCandidate) {
    for (const parentCandidate of context.parentCandidates) {
      const transactionPlan = fitEntirePlanInsideCandidate(
        instructionPlan,
        parentCandidate
      );
      if (transactionPlan) {
        parentCandidate.message = transactionPlan.message;
        await context.emitSingleTransactionPlanUpdated(parentCandidate);
        return null;
      }
    }
  } else {
    candidate =
      context.parentCandidates.length > 0 ? context.parentCandidates[0] : null;
  }

  const transactionPlans: TransactionPlan[] = [];
  for (const plan of instructionPlan.plans) {
    const transactionPlan = await traverse(plan, {
      ...context,
      parent: instructionPlan,
      parentCandidates: candidate ? [candidate] : [],
    });
    if (transactionPlan) {
      candidate = getSequentialCandidate(transactionPlan);
      const newPlans =
        transactionPlan.kind === 'sequential' &&
        (transactionPlan.divisible || !instructionPlan.divisible)
          ? transactionPlan.plans
          : [transactionPlan];
      transactionPlans.push(...newPlans);
    }
  }
  if (transactionPlans.length === 1) {
    return transactionPlans[0];
  }
  if (transactionPlans.length === 0) {
    return null;
  }
  return {
    kind: 'sequential',
    divisible: instructionPlan.divisible,
    plans: transactionPlans,
  };
}

async function traverseParallel(
  instructionPlan: ParallelInstructionPlan,
  context: TraverseContext
): Promise<MutableTransactionPlan | null> {
  const candidates: MutableSingleTransactionPlan[] = [
    ...context.parentCandidates,
  ];
  const transactionPlans: TransactionPlan[] = [];

  // Reorder children so iterable plans are last.
  const sortedChildren = [
    ...instructionPlan.plans.filter((plan) => plan.kind !== 'iterable'),
    ...instructionPlan.plans.filter((plan) => plan.kind === 'iterable'),
  ];

  for (const plan of sortedChildren) {
    const transactionPlan = await traverse(plan, {
      ...context,
      parent: instructionPlan,
      parentCandidates: candidates,
    });
    if (transactionPlan) {
      candidates.push(...getParallelCandidates(transactionPlan));
      const newPlans =
        transactionPlan.kind === 'parallel'
          ? transactionPlan.plans
          : [transactionPlan];
      transactionPlans.push(...newPlans);
    }
  }
  if (transactionPlans.length === 1) {
    return transactionPlans[0];
  }
  if (transactionPlans.length === 0) {
    return null;
  }
  return { kind: 'parallel', plans: transactionPlans };
}

async function traverseSingle(
  instructionPlan: SingleInstructionPlan,
  context: TraverseContext
): Promise<MutableTransactionPlan | null> {
  const ix = instructionPlan.instruction;
  const candidate = selectCandidate(context.parentCandidates, [ix]);
  if (candidate) {
    candidate.message = appendTransactionMessageInstructions(
      [ix],
      candidate.message
    );
    await context.emitSingleTransactionPlanUpdated(candidate);
    return null;
  }
  const plan = await context.createSingleTransactionPlan();
  plan.message = appendTransactionMessageInstructions([ix], plan.message);
  await context.emitSingleTransactionPlanUpdated(plan);
  return plan;
}

async function traverseIterable(
  instructionPlan: IterableInstructionPlan,
  context: TraverseContext
): Promise<MutableTransactionPlan | null> {
  const iterator = instructionPlan.getIterator();
  const transactionPlans: SingleTransactionPlan[] = [];
  const candidates = [...context.parentCandidates];

  while (iterator.hasNext()) {
    const candidateResult = selectCandidateForIterator(candidates, iterator);
    if (candidateResult) {
      const [candidate, ix] = candidateResult;
      candidate.message = appendTransactionMessageInstructions(
        [ix],
        candidate.message
      );
      await context.emitSingleTransactionPlanUpdated(candidate);
    } else {
      const newPlan = await context.createSingleTransactionPlan();
      const ix = iterator.next(newPlan.message);
      if (!ix) {
        throw new Error(
          'Could not fit `InterableInstructionPlan` into a transaction'
        );
      }
      newPlan.message = appendTransactionMessageInstructions(
        [ix],
        newPlan.message
      );
      await context.emitSingleTransactionPlanUpdated(newPlan);
      transactionPlans.push(newPlan);

      // Adding the new plan to the candidates is important for cases
      // where the next instruction doesn't fill the entire transaction.
      candidates.push(newPlan);
    }
  }

  if (transactionPlans.length === 1) {
    return transactionPlans[0];
  }
  if (transactionPlans.length === 0) {
    return null;
  }
  if (context.parent?.kind === 'parallel') {
    return { kind: 'parallel', plans: transactionPlans };
  }
  return {
    kind: 'sequential',
    divisible:
      context.parent?.kind === 'sequential' ? context.parent.divisible : true,
    plans: transactionPlans,
  };
}

function getSequentialCandidate(
  latestPlan: MutableTransactionPlan
): MutableSingleTransactionPlan | null {
  if (latestPlan.kind === 'single') {
    return latestPlan;
  }
  if (latestPlan.kind === 'sequential' && latestPlan.plans.length > 0) {
    return getSequentialCandidate(
      latestPlan.plans[latestPlan.plans.length - 1]
    );
  }
  return null;
}

function getParallelCandidates(
  latestPlan: TransactionPlan
): MutableSingleTransactionPlan[] {
  return getAllSingleTransactionPlans(latestPlan);
}

function selectCandidateForIterator(
  candidates: MutableSingleTransactionPlan[],
  iterator: InstructionIterator
): [MutableSingleTransactionPlan, IInstruction] | null {
  for (const candidate of candidates) {
    const ix = iterator.next(candidate.message);
    if (ix) {
      return [candidate, ix];
    }
  }
  return null;
}

function selectCandidate(
  candidates: MutableSingleTransactionPlan[],
  instructions: IInstruction[]
): MutableSingleTransactionPlan | null {
  const firstValidCandidate = candidates.find((candidate) =>
    isValidCandidate(candidate, instructions)
  );
  return firstValidCandidate ?? null;
}

function isValidCandidate(
  candidate: MutableSingleTransactionPlan,
  instructions: IInstruction[]
): boolean {
  const message = appendTransactionMessageInstructions(
    instructions,
    candidate.message
  );
  return getRemainingTransactionSize(message) >= 0;
}

export function getRemainingTransactionSize(
  message: CompilableTransactionMessage
) {
  return TRANSACTION_SIZE_LIMIT - getTransactionSize(message);
}

function freezeTransactionPlan(plan: MutableTransactionPlan): TransactionPlan {
  switch (plan.kind) {
    case 'single':
      return singleTransactionPlan(plan.message);
    case 'sequential':
      return plan.divisible
        ? sequentialTransactionPlan(plan.plans.map(freezeTransactionPlan))
        : nonDivisibleSequentialTransactionPlan(
            plan.plans.map(freezeTransactionPlan)
          );
    case 'parallel':
      return parallelTransactionPlan(plan.plans.map(freezeTransactionPlan));
    default:
      plan satisfies never;
      throw new Error(
        `Unknown transaction plan kind: ${(plan as { kind: string }).kind}`
      );
  }
}

function isValidTransactionPlan(transactionPlan: TransactionPlan): boolean {
  if (transactionPlan.kind === 'single') {
    const transactionSize = getTransactionSize(transactionPlan.message);
    return transactionSize <= TRANSACTION_SIZE_LIMIT;
  }
  return transactionPlan.plans.every(isValidTransactionPlan);
}

function fitEntirePlanInsideCandidate(
  instructionPlan: InstructionPlan,
  candidate: SingleTransactionPlan
): SingleTransactionPlan | null {
  let newCandidate: SingleTransactionPlan = candidate;

  switch (instructionPlan.kind) {
    case 'sequential':
    case 'parallel':
      for (const plan of instructionPlan.plans) {
        const result = fitEntirePlanInsideCandidate(plan, newCandidate);
        if (result === null) {
          return null;
        }
        newCandidate = result;
      }
      return newCandidate;
    case 'single':
      if (!isValidCandidate(candidate, [instructionPlan.instruction])) {
        return null;
      }
      return singleTransactionPlan(
        appendTransactionMessageInstructions(
          [instructionPlan.instruction],
          candidate.message
        )
      );
    case 'iterable':
      // eslint-disable-next-line no-case-declarations
      const iterator = instructionPlan.getIterator();
      while (iterator.hasNext()) {
        const ix = iterator.next(candidate.message);
        if (!ix || !isValidCandidate(candidate, [ix])) {
          return null;
        }
        newCandidate = singleTransactionPlan(
          appendTransactionMessageInstructions([ix], newCandidate.message)
        );
      }
      return newCandidate;
    default:
      instructionPlan satisfies never;
      throw new Error(
        `Unknown instruction plan kind: ${(instructionPlan as { kind: string }).kind}`
      );
  }
}
