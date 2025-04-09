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
  SingleTransactionPlan,
  TransactionPlan,
} from './transactionPlan';
import { TransactionPlanner } from './transactionPlanner';

export type TransactionPlannerFactory = (
  configs: TransactionPlannerFactoryConfig
) => TransactionPlanner;

export type TransactionPlannerFactoryConfig = {
  createTransactionMessage: () =>
    | Promise<CompilableTransactionMessage>
    | CompilableTransactionMessage;
  newInstructionsTransformer?: <
    TTransactionMessage extends CompilableTransactionMessage,
  >(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage> | TTransactionMessage;
};

export function createBaseTransactionPlannerFactory(): TransactionPlannerFactory {
  return (config) => {
    const createSingleTransactionPlan = async (
      instructions: IInstruction[] = []
    ): Promise<SingleTransactionPlan> => {
      const plan: SingleTransactionPlan = {
        kind: 'single',
        message: await Promise.resolve(config.createTransactionMessage()),
      };
      if (instructions.length > 0) {
        await addInstructionsToSingleTransactionPlan(plan, instructions);
      }
      return plan;
    };

    const addInstructionsToSingleTransactionPlan = async (
      plan: SingleTransactionPlan,
      instructions: IInstruction[]
    ): Promise<void> => {
      let message = appendTransactionMessageInstructions(
        instructions,
        plan.message
      );
      if (config?.newInstructionsTransformer) {
        message = await Promise.resolve(
          config.newInstructionsTransformer(plan.message)
        );
      }
      (plan as Mutable<SingleTransactionPlan>).message = message;
    };

    return async (originalInstructionPlan): Promise<TransactionPlan> => {
      const plan = await traverse(originalInstructionPlan, {
        parent: null,
        parentCandidates: [],
        createSingleTransactionPlan,
        addInstructionsToSingleTransactionPlan,
      });

      if (!plan) {
        throw new Error('No instructions were found in the instruction plan.');
      }

      return plan;
    };
  };
}

type TraverseContext = {
  parent: InstructionPlan | null;
  parentCandidates: SingleTransactionPlan[];
  createSingleTransactionPlan: (
    instructions?: IInstruction[]
  ) => Promise<SingleTransactionPlan>;
  addInstructionsToSingleTransactionPlan: (
    plan: SingleTransactionPlan,
    instructions: IInstruction[]
  ) => Promise<void>;
};

async function traverse(
  instructionPlan: InstructionPlan,
  context: TraverseContext
): Promise<TransactionPlan | null> {
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
): Promise<TransactionPlan | null> {
  let candidate: SingleTransactionPlan | null = null;
  const mustEntirelyFitInCandidate =
    context.parent &&
    (context.parent.kind === 'parallel' || !instructionPlan.divisible);
  if (mustEntirelyFitInCandidate) {
    const allInstructions = getAllInstructions(instructionPlan);
    candidate = allInstructions
      ? selectCandidate(context.parentCandidates, allInstructions)
      : null;
    if (candidate && allInstructions) {
      await context.addInstructionsToSingleTransactionPlan(
        candidate,
        allInstructions
      );
      return null;
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
): Promise<TransactionPlan | null> {
  const candidates: SingleTransactionPlan[] = [...context.parentCandidates];
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
): Promise<TransactionPlan | null> {
  const ix = instructionPlan.instruction;
  const candidate = selectCandidate(context.parentCandidates, [ix]);
  if (candidate) {
    await context.addInstructionsToSingleTransactionPlan(candidate, [ix]);
    return null;
  }
  return await context.createSingleTransactionPlan([ix]);
}

async function traverseIterable(
  instructionPlan: IterableInstructionPlan,
  context: TraverseContext
): Promise<TransactionPlan | null> {
  const iterator = instructionPlan.getIterator();
  const transactionPlans: SingleTransactionPlan[] = [];
  const candidates = [...context.parentCandidates];

  while (iterator.hasNext()) {
    const candidateResult = selectCandidateForIterator(candidates, iterator);
    if (candidateResult) {
      const [candidate, ix] = candidateResult;
      await context.addInstructionsToSingleTransactionPlan(candidate, [ix]);
    } else {
      const newPlan = await context.createSingleTransactionPlan();
      const ix = iterator.next(newPlan.message);
      if (!ix) {
        throw new Error(
          'Could not fit `InterableInstructionPlan` into a transaction'
        );
      }
      await context.addInstructionsToSingleTransactionPlan(newPlan, [ix]);
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
  latestPlan: TransactionPlan
): SingleTransactionPlan | null {
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
): SingleTransactionPlan[] {
  return getAllSingleTransactionPlans(latestPlan);
}

function getAllInstructions(
  instructionPlan: InstructionPlan
): IInstruction[] | null {
  if (instructionPlan.kind === 'single') {
    return [instructionPlan.instruction];
  }
  if (instructionPlan.kind === 'iterable') {
    return instructionPlan.getAll();
  }
  return instructionPlan.plans.reduce(
    (acc, plan) => {
      if (acc === null) return null;
      const instructions = getAllInstructions(plan);
      if (instructions === null) return null;
      acc.push(...instructions);
      return acc;
    },
    [] as IInstruction[] | null
  );
}

function selectCandidateForIterator(
  candidates: SingleTransactionPlan[],
  iterator: InstructionIterator
): [SingleTransactionPlan, IInstruction] | null {
  for (const candidate of candidates) {
    const ix = iterator.next(candidate.message);
    if (ix) {
      return [candidate, ix];
    }
  }
  return null;
}

function selectCandidate(
  candidates: SingleTransactionPlan[],
  instructions: IInstruction[]
): SingleTransactionPlan | null {
  const firstValidCandidate = candidates.find((candidate) =>
    isValidCandidate(candidate, instructions)
  );
  return firstValidCandidate ?? null;
}

function isValidCandidate(
  candidate: SingleTransactionPlan,
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
