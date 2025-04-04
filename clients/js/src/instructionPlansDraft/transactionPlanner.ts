import {
  Address,
  appendTransactionMessageInstructions,
  BaseTransactionMessage,
  Blockhash,
  CompilableTransactionMessage,
  compileTransaction,
  createTransactionMessage,
  getTransactionEncoder,
  ITransactionMessageWithFeePayer,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionMessageWithBlockhashLifetime,
  TransactionVersion,
} from '@solana/kit';
import {
  InstructionPlan,
  ParallelInstructionPlan,
  SequentialInstructionPlan,
  SingleInstructionPlan,
} from './instructionPlan';
import { SingleTransactionPlan, TransactionPlan } from './transactionPlan';

const TRANSACTION_SIZE_LIMIT =
  1_280 -
  40 /* 40 bytes is the size of the IPv6 header. */ -
  8; /* 8 bytes is the size of the fragment header. */

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export type TransactionPlannerConfig = {
  newTransactionTransformer?: <
    TTransactionMessage extends BaseTransactionMessage,
  >(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage>;
  newInstructionsTransformer?: <
    TTransactionMessage extends BaseTransactionMessage,
  >(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage>;
};

export type TransactionPlanner = (
  instructionPlan: InstructionPlan,
  config?: TransactionPlannerConfig
) => Promise<TransactionPlan>;

// TODO: Implement
// - Ask for additional instructions for each message. Maybe `getDefaultMessage` or `messageModifier` functions?
// - Add Compute Unit instructions.
// - Split instruction by sizes.
// - Provide remaining bytes to dynamic instructions.
// - Pack transaction messages as much as possible.
// - simulate CU.
export function createBaseTransactionPlanner({
  version,
}: {
  version: TransactionVersion;
}): TransactionPlanner {
  return async (originalInstructionPlan, config): Promise<TransactionPlan> => {
    const createSingleTransactionPlan = async (
      instructions: SingleInstructionPlan[] = []
    ): Promise<SingleTransactionPlan> => {
      const plan: SingleTransactionPlan = {
        kind: 'single',
        message: createTransactionMessage({ version }),
      };
      if (config?.newTransactionTransformer) {
        (plan as Mutable<SingleTransactionPlan>).message =
          await config.newTransactionTransformer(plan.message);
      }
      if (instructions.length > 0) {
        await addInstructionsToSingleTransactionPlan(plan, instructions);
      }
      return plan;
    };

    const addInstructionsToSingleTransactionPlan = async (
      plan: SingleTransactionPlan,
      instructions: SingleInstructionPlan[]
    ): Promise<void> => {
      let message = appendTransactionMessageInstructions(
        instructions.map((i) => i.instruction),
        plan.message
      );
      if (config?.newInstructionsTransformer) {
        message = await config.newInstructionsTransformer(plan.message);
      }
      (plan as Mutable<SingleTransactionPlan>).message = message;
    };

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
}

type TraverseContext = {
  parent: InstructionPlan | null;
  parentCandidates: SingleTransactionPlan[];
  createSingleTransactionPlan: (
    instructions?: SingleInstructionPlan[]
  ) => Promise<SingleTransactionPlan>;
  addInstructionsToSingleTransactionPlan: (
    plan: SingleTransactionPlan,
    instructions: SingleInstructionPlan[]
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
    case 'dynamic':
      throw new Error('Dynamic plans are not supported yet.');
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
    const allInstructions = getAllSingleInstructionPlans(instructionPlan);
    candidate = selectCandidate(context.parentCandidates, allInstructions);
    if (candidate) {
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
      transactionPlans.push(transactionPlan);
      candidate = getSequentialCandidate(transactionPlan);
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
  for (const plan of instructionPlan.plans) {
    const transactionPlan = await traverse(plan, {
      ...context,
      parent: instructionPlan,
      parentCandidates: candidates,
    });
    if (transactionPlan) {
      transactionPlans.push(transactionPlan);
      candidates.push(...getParallelCandidates(transactionPlan));
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
  const candidate = selectCandidate(context.parentCandidates, [
    instructionPlan,
  ]);
  if (candidate) {
    await context.addInstructionsToSingleTransactionPlan(candidate, [
      instructionPlan,
    ]);
    return null;
  }
  return await context.createSingleTransactionPlan([instructionPlan]);
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

function getAllSingleTransactionPlans(
  transactionPlan: TransactionPlan
): SingleTransactionPlan[] {
  if (transactionPlan.kind === 'sequential') {
    return transactionPlan.plans.flatMap(getAllSingleTransactionPlans);
  }
  if (transactionPlan.kind === 'parallel') {
    return transactionPlan.plans.flatMap(getAllSingleTransactionPlans);
  }
  return [transactionPlan];
}

// TODO: This will need tweaking when adding support for dynamic instructions.
function getAllSingleInstructionPlans(
  instructionPlan: InstructionPlan
): SingleInstructionPlan[] {
  if (instructionPlan.kind === 'sequential') {
    return instructionPlan.plans.flatMap(getAllSingleInstructionPlans);
  }
  if (instructionPlan.kind === 'parallel') {
    return instructionPlan.plans.flatMap(getAllSingleInstructionPlans);
  }
  if (instructionPlan.kind === 'dynamic') {
    throw new Error('Dynamic plans are not supported yet.');
  }
  return [instructionPlan];
}

function selectCandidate(
  candidates: SingleTransactionPlan[],
  instructionPlans: SingleInstructionPlan[]
): SingleTransactionPlan | null {
  const firstValidCandidate = candidates.find((candidate) =>
    isValidCandidate(candidate, instructionPlans)
  );
  return firstValidCandidate ?? null;
}

function isValidCandidate(
  candidate: SingleTransactionPlan,
  instructionPlans: SingleInstructionPlan[]
): boolean {
  const message = appendTransactionMessageInstructions(
    instructionPlans.map((i) => i.instruction),
    candidate.message
  );
  return getRemainingTransactionSize(message) >= 0;
}

export function getRemainingTransactionSize(message: BaseTransactionMessage) {
  return TRANSACTION_SIZE_LIMIT - getTransactionSize(message);
}

export function getTransactionSize(
  message: BaseTransactionMessage & Partial<CompilableTransactionMessage>
): number {
  const mockFeePayer =
    'Gm1uVH3JxiLgafByNNmnoxLncB7ytpyWNqX3kRM9tSxN' as Address;
  const mockBlockhash = {
    blockhash: '2WCjwT4P5tJF7tjMtTVEnN6o53bcZ8MhszcfXMERtU3z' as Blockhash,
    lastValidBlockHeight: 0n,
  };
  const transaction = pipe(
    message,
    (tx) => {
      return tx.feePayer
        ? (tx as typeof tx & ITransactionMessageWithFeePayer)
        : setTransactionMessageFeePayer(mockFeePayer, tx);
    },
    (tx) => {
      return tx.lifetimeConstraint
        ? (tx as typeof tx & TransactionMessageWithBlockhashLifetime)
        : setTransactionMessageLifetimeUsingBlockhash(mockBlockhash, tx);
    },
    (tx) => compileTransaction(tx)
  );
  return getTransactionEncoder().getSizeFromValue(transaction);
}
