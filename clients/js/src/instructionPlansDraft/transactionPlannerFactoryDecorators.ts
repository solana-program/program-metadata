import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  ComputeBudgetInstruction,
  getSetComputeUnitLimitInstruction,
  identifyComputeBudgetInstruction,
} from '@solana-program/compute-budget';
import {
  Address,
  appendTransactionMessageInstructions,
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
import { getTimedCacheFunction, Mutable } from './internal';
import {
  getAllSingleTransactionPlans,
  SingleTransactionPlan,
  TransactionPlan,
} from './transactionPlan';
import { TransactionPlannerFactory } from './transactionPlannerFactory';

function transformTransactionPlannerNewMessage(
  transformer: <TTransactionMessage extends CompilableTransactionMessage>(
    transactionMessage: TTransactionMessage
  ) => Promise<TTransactionMessage> | TTransactionMessage,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return (config) => {
    return plannerFactory({
      ...config,
      createTransactionMessage: async () => {
        const tx = await Promise.resolve(config.createTransactionMessage());
        return await Promise.resolve(transformer(tx));
      },
    });
  };
}

function transformTransactionPlan(
  transformer: (transactionPlan: TransactionPlan) => Promise<TransactionPlan>,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return (config) => {
    const planner = plannerFactory(config);
    return async (instructionPlan) =>
      await transformer(await planner(instructionPlan));
  };
}

export function prependTransactionPlannerInstructions(
  instructions: IInstruction[],
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    (tx) => prependTransactionMessageInstructions(instructions, tx),
    plannerFactory
  );
}

export function appendTransactionPlannerInstructions(
  instructions: IInstruction[],
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    plannerFactory
  );
}

export function setTransactionPlannerFeePayer(
  feePayer: Address,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    <TTransactionMessage extends CompilableTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      setTransactionMessageFeePayer(feePayer, tx) as TTransactionMessage &
        ITransactionMessageWithFeePayer,
    plannerFactory
  );
}

export function setTransactionPlannerFeePayerSigner(
  feePayerSigner: TransactionSigner,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  return transformTransactionPlannerNewMessage(
    <TTransactionMessage extends CompilableTransactionMessage>(
      tx: TTransactionMessage
    ) =>
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        tx
      ) as TTransactionMessage & ITransactionMessageWithFeePayerSigner,
    plannerFactory
  );
}

export function setTransactionPlannerLifetimeUsingLatestBlockhash(
  rpc: Rpc<GetLatestBlockhashApi>,
  plannerFactory: TransactionPlannerFactory
): TransactionPlannerFactory {
  // Cache the latest blockhash for 60 seconds.
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);

  return transformTransactionPlannerNewMessage(
    async (tx) =>
      setTransactionMessageLifetimeUsingBlockhash(await getBlockhash(), tx),
    plannerFactory
  );
}

const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

// TODO: This will need decoupling from `@solana-program/compute-budget`
// when added to `@solana/instruction-plans`. Also, the function
// `getComputeUnitEstimateForTransactionMessageFactory` will need to
// move in a granular package so `instruction-plans` can use it.
export function estimateAndSetComputeUnitLimitForTransactionPlanner(
  rpc: Rpc<SimulateTransactionApi>,
  plannerFactory: TransactionPlannerFactory,
  chunkSize: number | null = 10
): TransactionPlannerFactory {
  // Create a function to estimate the compute unit limit for a transaction.
  const estimateComputeUnitLimit =
    getComputeUnitEstimateForTransactionMessageFactory({ rpc });

  // Add a compute unit limit instruction to the transaction if it doesn't exist.
  const plannerWithComputeBudgetLimits = transformTransactionPlannerNewMessage(
    (tx) => {
      if (getComputeUnitLimitInstructionIndex(tx) >= 0) {
        return tx;
      }

      return prependTransactionMessageInstruction(
        getSetComputeUnitLimitInstruction({ units: MAX_COMPUTE_UNIT_LIMIT }),
        tx
      );
    },
    plannerFactory
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
        const newMessage: CompilableTransactionMessage =
          instructionIndex === -1
            ? prependTransactionMessageInstruction(
                getSetComputeUnitLimitInstruction({
                  units: computeUnitsEstimate,
                }),
                singlePlan.message
              )
            : ({
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
              } as CompilableTransactionMessage);
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

function getComputeUnitLimitInstructionIndex(
  transactionMessage: CompilableTransactionMessage
) {
  return transactionMessage.instructions.findIndex((ix) => {
    return (
      ix.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
      identifyComputeBudgetInstruction(ix.data as Uint8Array) ===
        ComputeBudgetInstruction.SetComputeUnitLimit
    );
  });
}
