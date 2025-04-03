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
import { InstructionPlan, SingleInstructionPlan } from './instructionPlan';
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

    // Recursive function that traverses the instruction plan and constructs the transaction plan.
    const traverse = async (
      instructionPlan: InstructionPlan,
      candidates: SingleTransactionPlan[] = []
    ): Promise<TransactionPlan | null> => {
      if (instructionPlan.kind === 'sequential' && !instructionPlan.divisible) {
        throw new Error(
          'Non-divisible sequential plans are not supported yet.'
        );
      }

      if (instructionPlan.kind === 'sequential') {
        let candidate: SingleTransactionPlan | null = null;
        const transactionPlans: TransactionPlan[] = [];
        for (const plan of instructionPlan.plans) {
          const transactionPlan = await traverse(
            plan,
            candidate ? [candidate] : []
          );
          if (transactionPlan) {
            transactionPlans.push(transactionPlan);
            candidate = getSequentialCandidate(transactionPlan);
          }
        }
        if (transactionPlans.length === 1) {
          return transactionPlans[0];
        }
        if (transactionPlans.length > 0) {
          return null;
        }
        return { kind: 'sequential', divisible: true, plans: transactionPlans };
      }

      if (instructionPlan.kind === 'parallel') {
        const candidates: SingleTransactionPlan[] = [];
        const transactionPlans: TransactionPlan[] = [];
        for (const plan of instructionPlan.plans) {
          const transactionPlan = await traverse(plan, candidates);
          if (transactionPlan) {
            transactionPlans.push(transactionPlan);
            candidates.push(...getParallelCandidates(transactionPlan));
          }
        }
        if (transactionPlans.length === 1) {
          return transactionPlans[0];
        }
        if (transactionPlans.length > 0) {
          return null;
        }
        return { kind: 'parallel', plans: transactionPlans };
      }

      if (instructionPlan.kind === 'dynamic') {
        throw new Error('Dynamic plans are not supported yet.');
      }

      if (instructionPlan.kind === 'single') {
        const candidate = selectCandidate(candidates, [instructionPlan]);
        if (candidate) {
          await addInstructionsToSingleTransactionPlan(candidate, [
            instructionPlan,
          ]);
          return null;
        }
        return await createSingleTransactionPlan([instructionPlan]);
      }

      instructionPlan satisfies never;
      throw new Error(
        `Unknown instruction plan kind: ${(instructionPlan as { kind: string }).kind}`
      );
    };

    const plan = await traverse(originalInstructionPlan);
    if (!plan) {
      throw new Error('Transaction plan is null.'); // Should never happen.
    }

    return plan;
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

function getRemainingTransactionSize(message: BaseTransactionMessage) {
  return (
    TRANSACTION_SIZE_LIMIT -
    getTransactionSize(message) -
    1 /* Subtract 1 byte buffer to account for shortvec encoding. */
  );
}

function getTransactionSize(
  message: BaseTransactionMessage & Partial<CompilableTransactionMessage>
): number {
  const mockFeePayer = '11111111111111111111111111111111' as Address;
  const mockBlockhash = {
    blockhash: '11111111111111111111111111111111' as Blockhash,
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
