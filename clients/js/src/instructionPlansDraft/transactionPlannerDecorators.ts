import {
  Address,
  appendTransactionMessageInstructions,
  BaseTransactionMessage,
  CompilableTransactionMessage,
  getComputeUnitEstimateForTransactionMessageFactory,
  GetLatestBlockhashApi,
  IInstruction,
  ITransactionMessageWithFeePayer,
  ITransactionMessageWithFeePayerSigner,
  prependTransactionMessageInstruction,
  prependTransactionMessageInstructions,
  Rpc,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  SimulateTransactionApi,
  TransactionSigner,
} from '@solana/kit';
import {
  TransactionPlanner,
  TransactionPlannerConfig,
} from './transactionPlanner';
import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  ComputeBudgetInstruction,
  getSetComputeUnitLimitInstruction,
  identifyComputeBudgetInstruction,
} from '@solana-program/compute-budget';
import { SingleTransactionPlan, TransactionPlan } from './transactionPlan';

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export function transformNewTransactionPlannerMessage(
  transformer: Required<TransactionPlannerConfig>['newTransactionTransformer'],
  planner: TransactionPlanner
): TransactionPlanner {
  return async (instructionPlan, config) => {
    return await planner(instructionPlan, {
      ...config,
      newTransactionTransformer: async (tx) => {
        const transformedTx = await transformer(tx);
        return config?.newTransactionTransformer
          ? await config.newTransactionTransformer(transformedTx)
          : transformedTx;
      },
    });
  };
}

export function transformTransactionPlan(
  transformer: (transactionPlan: TransactionPlan) => Promise<TransactionPlan>,
  planner: TransactionPlanner
): TransactionPlanner {
  return async (instructionPlan, config) => {
    return await transformer(await planner(instructionPlan, config));
  };
}

export function prependTransactionPlannerInstructions(
  instructions: IInstruction[],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformNewTransactionPlannerMessage(
    (tx) =>
      Promise.resolve(prependTransactionMessageInstructions(instructions, tx)),
    planner
  );
}

export function appendTransactionPlannerInstructions(
  instructions: IInstruction[],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformNewTransactionPlannerMessage(
    (tx) =>
      Promise.resolve(appendTransactionMessageInstructions(instructions, tx)),
    planner
  );
}

export function setTransactionPlannerFeePayer(
  feePayer: Address,
  planner: TransactionPlanner
): TransactionPlanner {
  return transformNewTransactionPlannerMessage(
    <TTransactionMessage extends BaseTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      Promise.resolve(
        setTransactionMessageFeePayer(feePayer, tx) as TTransactionMessage &
          ITransactionMessageWithFeePayer
      ),
    planner
  );
}

export function setTransactionPlannerFeePayerSigner(
  feePayerSigner: TransactionSigner,
  planner: TransactionPlanner
): TransactionPlanner {
  return transformNewTransactionPlannerMessage(
    <TTransactionMessage extends BaseTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      Promise.resolve(
        setTransactionMessageFeePayerSigner(
          feePayerSigner,
          tx
        ) as TTransactionMessage & ITransactionMessageWithFeePayerSigner
      ),
    planner
  );
}

export function setTransactionPlannerLifetimeUsingLatestBlockhash(
  rpc: Rpc<GetLatestBlockhashApi>,
  planner: TransactionPlanner
): TransactionPlanner {
  // Cache the latest blockhash for 60 seconds.
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);

  return transformNewTransactionPlannerMessage(
    async (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(await getBlockhash(), tx),
    planner
  );
}

const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

// TODO: This will need decoupling from `@solana-program/compute-budget`
// when added to `@solana/instruction-plans`. Also, the function
// `getComputeUnitEstimateForTransactionMessageFactory` will need to
// move in a granular package so `instruction-plans` can use it.
export function estimateAndSetComputeUnitLimitForTransactionPlanner(
  rpc: Rpc<SimulateTransactionApi>,
  planner: TransactionPlanner,
  chunkSize: number | null = 10
): TransactionPlanner {
  // Create a function to estimate the compute unit limit for a transaction.
  const estimateComputeUnitLimit =
    getComputeUnitEstimateForTransactionMessageFactory({ rpc });

  // Add a compute unit limit instruction to the transaction if it doesn't exist.
  const plannerWithComputeBudgetLimits = transformNewTransactionPlannerMessage(
    (tx) => {
      if (getComputeUnitLimitInstructionIndex(tx) >= 0) {
        return Promise.resolve(tx);
      }

      return Promise.resolve(
        prependTransactionMessageInstruction(
          getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT }),
          tx
        )
      );
    },
    planner
  );

  // Transform the final transaction plan to set the correct compute unit limit.
  return transformTransactionPlan(async (plan) => {
    const promises = getAllSingleTransactionPlans(plan).map(
      async (singlePlan) => {
        const computeUnitsEstimate = await estimateComputeUnitLimit(
          singlePlan.message as CompilableTransactionMessage
        );
        const instructionIndex = getComputeUnitLimitInstructionIndex(
          singlePlan.message
        );
        const newMessage =
          instructionIndex === -1
            ? prependTransactionMessageInstruction(
                getSetComputeUnitLimitInstruction({
                  units: computeUnitsEstimate,
                }),
                singlePlan.message
              )
            : {
                ...singlePlan.message,
                instructions: [
                  ...singlePlan.message.instructions.slice(0, instructionIndex),
                  getSetComputeUnitLimitInstruction({
                    units: computeUnitsEstimate,
                  }),
                  ...singlePlan.message.instructions.slice(
                    instructionIndex + 1
                  ),
                ],
              };
        (singlePlan as Mutable<SingleTransactionPlan>).message = newMessage;
      }
    );

    // Chunk promises to avoid rate limiting.
    const chunkedPromises = [];
    if (!chunkSize) {
      chunkedPromises.push(promises);
    } else {
      for (let i = 0; i < promises.length; i += chunkSize) {
        const chunk = promises.slice(i, i + chunkSize);
        chunkedPromises.push(chunk);
      }
    }
    for (const chunk of chunkedPromises) {
      await Promise.all(chunk);
    }

    return plan;
  }, plannerWithComputeBudgetLimits);
}

function getTimedCacheFunction<T>(
  fn: () => Promise<T>,
  timeoutInMilliseconds: number
): () => Promise<T> {
  let cache: T | null = null;
  let lastFetchTime = 0;
  return async () => {
    const currentTime = Date.now();

    // Cache hit.
    if (cache && currentTime - lastFetchTime < timeoutInMilliseconds) {
      return cache;
    }

    // Cache miss.
    cache = await fn();
    lastFetchTime = currentTime;
    return cache;
  };
}

function getComputeUnitLimitInstructionIndex(
  transactionMessage: BaseTransactionMessage
) {
  return transactionMessage.instructions.findIndex((ix) => {
    return (
      ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
      identifyComputeBudgetInstruction(ix.data as Uint8Array) ===
        ComputeBudgetInstruction.SetComputeUnitLimit
    );
  });
}

function getAllSingleTransactionPlans(
  transactionPlan: TransactionPlan
): SingleTransactionPlan[] {
  if (transactionPlan.kind === 'single') {
    return [transactionPlan];
  }
  return transactionPlan.plans.flatMap(getAllSingleTransactionPlans);
}
