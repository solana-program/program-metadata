import {
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  TransactionMessage,
} from '@solana/kit';
import {
  CannotPackUsingProvidedMessageError as CannotPackUsingProvidedMessageError,
  InstructionPlan,
  MessagePackerInstructionPlan,
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
    instructionPlan,
    { abortSignal } = {}
  ): Promise<TransactionPlan> => {
    const plan = await traverse(instructionPlan, {
      abortSignal,
      parent: null,
      parentCandidates: [],
      createTransactionMessage: config.createTransactionMessage,
      onTransactionMessageUpdated:
        config.onTransactionMessageUpdated ?? ((msg) => msg),
    });

    if (!plan) {
      throw new NoInstructionsFoundInInstructionPlanError();
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
    case 'messagePacker':
      return await traverseMessagePacker(instructionPlan, context);
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

  // Check if the sequential plan must fit entirely in its parent candidates
  // due to constraints like being inside a parallel plan or not being divisible.
  const mustEntirelyFitInParentCandidate =
    context.parent &&
    (context.parent.kind === 'parallel' || !instructionPlan.divisible);

  // If so, try to fit the entire plan inside one of the parent candidates.
  if (mustEntirelyFitInParentCandidate) {
    const candidate = await selectAndMutateCandidate(
      context,
      context.parentCandidates,
      (message) => fitEntirePlanInsideMessage(instructionPlan, message)
    );
    // If that's possible, we the candidate is mutated and we can return null.
    // Otherwise, we proceed with the normal traversal and no parent candidate.
    if (candidate) {
      return null;
    }
  } else {
    // Otherwise, we can use the first parent candidate, if any,
    // since we know it must be a divisible sequential plan.
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

  // Wrap in a sequential plan or simplify.
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

  // Reorder children so message packer plans are last.
  const sortedChildren = [
    ...instructionPlan.plans.filter((plan) => plan.kind !== 'messagePacker'),
    ...instructionPlan.plans.filter((plan) => plan.kind === 'messagePacker'),
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

  // Wrap in a parallel plan or simplify.
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
  const predicate = (message: CompilableTransactionMessage) =>
    appendTransactionMessageInstructions(
      [instructionPlan.instruction],
      message
    );
  const candidate = await selectAndMutateCandidate(
    context,
    context.parentCandidates,
    predicate
  );
  if (candidate) {
    return null;
  }
  const message = await createNewMessage(context, instructionPlan, predicate);
  return { kind: 'single', message };
}

async function traverseMessagePacker(
  instructionPlan: MessagePackerInstructionPlan,
  context: TraverseContext
): Promise<MutableTransactionPlan | null> {
  const messagePacker = instructionPlan.getMessagePacker();
  const transactionPlans: SingleTransactionPlan[] = [];
  const candidates = [...context.parentCandidates];

  while (messagePacker.done()) {
    const candidate = await selectAndMutateCandidate(
      context,
      candidates,
      messagePacker.packMessageToCapacity
    );
    if (!candidate) {
      const message = await createNewMessage(
        context,
        instructionPlan,
        messagePacker.packMessageToCapacity
      );
      const newPlan: MutableSingleTransactionPlan = { kind: 'single', message };
      transactionPlans.push(newPlan);
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

async function selectAndMutateCandidate(
  context: Pick<TraverseContext, 'onTransactionMessageUpdated' | 'abortSignal'>,
  candidates: MutableSingleTransactionPlan[],
  predicate: (
    message: CompilableTransactionMessage
  ) => CompilableTransactionMessage
): Promise<MutableSingleTransactionPlan | null> {
  for (const candidate of candidates) {
    try {
      const message = await Promise.resolve(
        context.onTransactionMessageUpdated(predicate(candidate.message), {
          abortSignal: context.abortSignal,
        })
      );
      if (getTransactionSize(message) <= TRANSACTION_SIZE_LIMIT) {
        candidate.message = message;
        return candidate;
      }
    } catch (error) {
      if (
        error instanceof CannotPackUsingProvidedMessageError ||
        error instanceof CannotFitEntirePlanInsideMessageError
      ) {
        // Try the next candidate.
      } else {
        throw error;
      }
    }
  }
  return null;
}

async function createNewMessage(
  context: Pick<
    TraverseContext,
    'createTransactionMessage' | 'onTransactionMessageUpdated' | 'abortSignal'
  >,
  instructionPlan: InstructionPlan,
  predicate: (
    message: CompilableTransactionMessage
  ) => CompilableTransactionMessage
): Promise<CompilableTransactionMessage> {
  const newMessage = await Promise.resolve(
    context.createTransactionMessage({ abortSignal: context.abortSignal })
  );
  const updatedMessage = await Promise.resolve(
    context.onTransactionMessageUpdated(predicate(newMessage), {
      abortSignal: context.abortSignal,
    })
  );
  if (getTransactionSize(updatedMessage) > TRANSACTION_SIZE_LIMIT) {
    throw new FailedToFitPlanInNewMessageError(instructionPlan, updatedMessage);
  }
  return updatedMessage;
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

function fitEntirePlanInsideMessage(
  instructionPlan: InstructionPlan,
  message: CompilableTransactionMessage
): CompilableTransactionMessage {
  let newMessage: CompilableTransactionMessage = message;

  switch (instructionPlan.kind) {
    case 'sequential':
    case 'parallel':
      for (const plan of instructionPlan.plans) {
        newMessage = fitEntirePlanInsideMessage(plan, newMessage);
      }
      return newMessage;
    case 'single':
      // eslint-disable-next-line no-case-declarations
      newMessage = appendTransactionMessageInstructions(
        [instructionPlan.instruction],
        message
      );
      if (getTransactionSize(newMessage) > TRANSACTION_SIZE_LIMIT) {
        throw new CannotFitEntirePlanInsideMessageError();
      }
      return newMessage;
    case 'messagePacker':
      // eslint-disable-next-line no-case-declarations
      const messagePacker = instructionPlan.getMessagePacker();
      while (messagePacker.done()) {
        try {
          newMessage = messagePacker.packMessageToCapacity(message);
          if (getTransactionSize(newMessage) > TRANSACTION_SIZE_LIMIT) {
            throw new CannotFitEntirePlanInsideMessageError();
          }
        } catch (error) {
          if (error instanceof CannotPackUsingProvidedMessageError) {
            throw new CannotFitEntirePlanInsideMessageError();
          }
          throw error;
        }
      }
      return newMessage;
    default:
      instructionPlan satisfies never;
      throw new Error(
        `Unknown instruction plan kind: ${(instructionPlan as { kind: string }).kind}`
      );
  }
}

// TODO: Below should be SolanaErrors.

export class FailedToFitPlanInNewMessageError extends Error {
  constructor(
    public readonly instructionPlan: InstructionPlan,
    public readonly transactionMessage: TransactionMessage
  ) {
    super(
      `The provided instruction plan could not fit in a new transaction message.`
    );
    this.name = 'FailedToFitPlanInNewMessageError';
  }
}

class NoInstructionsFoundInInstructionPlanError extends Error {
  constructor() {
    super('No instructions were found in the provided instruction plan.');
    this.name = 'NoInstructionsFoundInInstructionPlanError';
  }
}

class CannotFitEntirePlanInsideMessageError extends Error {
  constructor() {
    super('Cannot fit the entire instruction plan inside the provided message');
    this.name = 'CannotFitEntirePlanInsideMessageError';
  }
}
