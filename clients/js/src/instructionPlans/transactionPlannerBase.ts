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

type CreateTransactionMessage = (config?: {
  abortSignal?: AbortSignal;
}) => Promise<CompilableTransactionMessage> | CompilableTransactionMessage;

type OnTransactionMessageUpdated = <
  TTransactionMessage extends CompilableTransactionMessage,
>(
  transactionMessage: TTransactionMessage,
  config?: { abortSignal?: AbortSignal }
) => Promise<TTransactionMessage> | TTransactionMessage;

export type TransactionPlannerConfig = {
  createTransactionMessage: CreateTransactionMessage;
  onTransactionMessageUpdated?: OnTransactionMessageUpdated;
};

export function createBaseTransactionPlanner(
  config: TransactionPlannerConfig
): TransactionPlanner {
  return async (
    originalInstructionPlan,
    { abortSignal } = {}
  ): Promise<TransactionPlan> => {
    const plan = await traverse(originalInstructionPlan, {
      abortSignal,
      parent: null,
      parentCandidates: [],
      createTransactionMessage: config.createTransactionMessage,
      onTransactionMessageUpdated:
        config.onTransactionMessageUpdated ?? ((msg) => msg),
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

type TraverseContext = {
  abortSignal?: AbortSignal;
  parent: InstructionPlan | null;
  parentCandidates: MutableSingleTransactionPlan[];
  createTransactionMessage: CreateTransactionMessage;
  onTransactionMessageUpdated: OnTransactionMessageUpdated;
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
        const message = await Promise.resolve(
          context.onTransactionMessageUpdated(transactionPlan.message, {
            abortSignal: context.abortSignal,
          })
        );
        parentCandidate.message = message;
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

  // TODO: Get candidate and new message ???
  const candidate = selectCandidate(context.parentCandidates, (message) =>
    appendTransactionMessageInstructions([ix], message)
  );

  if (candidate) {
    candidate.message = await Promise.resolve(
      context.onTransactionMessageUpdated(
        appendTransactionMessageInstructions([ix], candidate.message),
        { abortSignal: context.abortSignal }
      )
    );
    return null;
  }

  const message = await Promise.resolve(
    context.createTransactionMessage({ abortSignal: context.abortSignal })
  );
  return {
    kind: 'single',
    message: await Promise.resolve(
      context.onTransactionMessageUpdated(
        appendTransactionMessageInstructions([ix], message),
        { abortSignal: context.abortSignal }
      )
    ),
  };
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
      candidate.message = await Promise.resolve(
        context.onTransactionMessageUpdated(
          appendTransactionMessageInstructions([ix], candidate.message),
          { abortSignal: context.abortSignal }
        )
      );
    } else {
      const message = await Promise.resolve(
        context.createTransactionMessage({ abortSignal: context.abortSignal })
      );
      const ix = iterator.next(message);
      if (!ix) {
        throw new Error(
          'Could not fit `InterableInstructionPlan` into a transaction'
        );
      }
      const newPlan: MutableSingleTransactionPlan = {
        kind: 'single',
        message: await Promise.resolve(
          context.onTransactionMessageUpdated(
            appendTransactionMessageInstructions([ix], message),
            { abortSignal: context.abortSignal }
          )
        ),
      };
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

// async function selectCandidateWithContext(
//   context: Pick<TraverseContext, 'emitSingleTransactionPlanUpdated'>,
//   candidates: MutableSingleTransactionPlan[],
//   predicate: (
//     message: CompilableTransactionMessage
//   ) => CompilableTransactionMessage
// ): Promise<MutableSingleTransactionPlan | null> {
//   for (const candidate of candidates) {
//     if (isValidCandidate(candidate, predicate)) {
//       // 1. Check immutable message.
//       // 2. Apply message to candidate.
//       candidate.message = predicate(candidate.message);
//       await context.emitSingleTransactionPlanUpdated(candidate);
//       if (isValidTransactionPlan(candidate)) {
//         return candidate;
//       }
//     }
//   }
//   return null;
// }

function selectCandidate(
  candidates: MutableSingleTransactionPlan[],
  predicate: (
    message: CompilableTransactionMessage
  ) => CompilableTransactionMessage
): MutableSingleTransactionPlan | null {
  const firstValidCandidate = candidates.find((candidate) =>
    isValidCandidate(candidate, predicate)
  );
  return firstValidCandidate ?? null;
}

function isValidCandidate(
  candidate: MutableSingleTransactionPlan,
  predicate: (
    message: CompilableTransactionMessage
  ) => CompilableTransactionMessage
): boolean {
  const message = predicate(candidate.message);
  return getTransactionSize(message) <= TRANSACTION_SIZE_LIMIT;
}

function isValidCandidateWithInstructions(
  candidate: MutableSingleTransactionPlan,
  instructions: IInstruction[]
): boolean {
  return isValidCandidate(candidate, (message) =>
    appendTransactionMessageInstructions(instructions, message)
  );
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
      if (
        !isValidCandidateWithInstructions(candidate, [
          instructionPlan.instruction,
        ])
      ) {
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
        if (!ix || !isValidCandidateWithInstructions(candidate, [ix])) {
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
