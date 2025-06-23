import {
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
} from '@solana/kit';
import {
  CannotIterateUsingProvidedMessageError,
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
  const mustEntirelyFitInParentCandidate =
    context.parent &&
    (context.parent.kind === 'parallel' || !instructionPlan.divisible);
  if (mustEntirelyFitInParentCandidate) {
    const candidate = await selectAndMutateCandidate(
      context,
      context.parentCandidates,
      (message) => fitEntirePlanInsideMessage(instructionPlan, message)
    );
    if (candidate) {
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
  const message = await createNewMessage(context, predicate);
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
      messagePacker.packMessage
    );
    if (!candidate) {
      const message = await createNewMessage(
        context,
        messagePacker.packMessage
      );
      const newPlan: MutableSingleTransactionPlan = { kind: 'single', message };
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
        error instanceof CannotIterateUsingProvidedMessageError ||
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
  predicate: (
    message: CompilableTransactionMessage
  ) => CompilableTransactionMessage
): Promise<CompilableTransactionMessage> {
  const message = await Promise.resolve(
    context.createTransactionMessage({ abortSignal: context.abortSignal })
  );
  return await Promise.resolve(
    context.onTransactionMessageUpdated(predicate(message), {
      abortSignal: context.abortSignal,
    })
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

class CannotFitEntirePlanInsideMessageError extends Error {
  constructor() {
    super('Cannot fit the entire instruction plan inside the provided message');
    this.name = 'CannotFitEntirePlanInsideMessageError';
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
          newMessage = messagePacker.packMessage(message);
          if (getTransactionSize(newMessage) > TRANSACTION_SIZE_LIMIT) {
            throw new CannotFitEntirePlanInsideMessageError();
          }
        } catch (error) {
          if (error instanceof CannotIterateUsingProvidedMessageError) {
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
