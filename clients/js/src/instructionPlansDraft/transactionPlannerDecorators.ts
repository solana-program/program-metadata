import {
  Address,
  appendTransactionMessageInstructions,
  BaseTransactionMessage,
  getComputeUnitEstimateForTransactionMessageFactory,
  GetLatestBlockhashApi,
  IInstruction,
  ITransactionMessageWithFeePayer,
  ITransactionMessageWithFeePayerSigner,
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

export function transformTransactionPlannerMessage(
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

export function prependTransactionPlannerInstructions(
  instructions: IInstruction[],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    (tx) =>
      Promise.resolve(prependTransactionMessageInstructions(instructions, tx)),
    planner
  );
}

export function appendTransactionPlannerInstructions(
  instructions: IInstruction[],
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
    (tx) =>
      Promise.resolve(appendTransactionMessageInstructions(instructions, tx)),
    planner
  );
}

export function setTransactionPlannerFeePayer(
  feePayer: Address,
  planner: TransactionPlanner
): TransactionPlanner {
  return transformTransactionPlannerMessage(
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
  return transformTransactionPlannerMessage(
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

  return transformTransactionPlannerMessage(
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
  planner: TransactionPlanner
): TransactionPlanner {
  const estimate = getComputeUnitEstimateForTransactionMessageFactory({ rpc });

  return transformTransactionPlannerMessage((tx) => {
    const hasComputeBudgetLimit = tx.instructions.some((ix) => {
      return (
        ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
        identifyComputeBudgetInstruction(ix.data as Uint8Array) ===
          ComputeBudgetInstruction.SetComputeUnitLimit
      );
    });

    if (hasComputeBudgetLimit) {
      return Promise.resolve(tx);
    }

    return Promise.resolve(
      prependTransactionMessageInstructions(
        [getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT })],
        tx
      )
    );
  }, planner);
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
