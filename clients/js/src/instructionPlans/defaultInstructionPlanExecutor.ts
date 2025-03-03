import {
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  ComputeBudgetInstruction,
  getSetComputeUnitLimitInstruction,
  identifyComputeBudgetInstruction,
} from '@solana-program/compute-budget';
import {
  Commitment,
  CompilableTransactionMessage,
  compileTransaction,
  FullySignedTransaction,
  getBase64EncodedWireTransaction,
  GetEpochInfoApi,
  GetSignatureStatusesApi,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  SendTransactionApi,
  SignatureNotificationsApi,
  signTransactionMessageWithSigners,
  SimulateTransactionApi,
  SlotNotificationsApi,
  TransactionMessageWithBlockhashLifetime,
  TransactionMessageWithDurableNonceLifetime,
  TransactionWithBlockhashLifetime,
} from '@solana/kit';
import {
  getTransactionMessageFromPlan,
  MessageInstructionPlan,
} from './instructionPlan';
import {
  chunkParallelInstructionPlans,
  createInstructionPlanExecutor,
  InstructionPlanExecutor,
} from './instructionPlanExecutor';

export type DefaultInstructionPlanExecutorConfig = Readonly<{
  rpc: Rpc<
    GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi &
      SimulateTransactionApi
  >;

  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;

  /**
   * The commitment to use when confirming transactions.
   */
  commitment?: Commitment;

  /**
   * When provided, chunks the plans inside a {@link ParallelInstructionPlan}.
   * Each chunk is executed sequentially but each plan within a chunk is
   * executed in parallel.
   */
  parallelChunkSize?: number;

  /**
   * If true _and_ if the transaction message contains an instruction
   * that sets the compute unit limit to any value, the executor will
   * simulate the transaction to determine the optimal compute unit limit
   * before updating the compute budget instruction with the computed value.
   */
  simulateComputeUnitLimit?: boolean;

  /**
   * Returns the default transaction message used to send transactions.
   * Any instructions inside a {@link MessageInstructionPlan} will be
   * appended to this message.
   */
  getDefaultMessage: (config?: {
    abortSignal?: AbortSignal;
  }) => Promise<
    CompilableTransactionMessage &
      (
        | TransactionMessageWithBlockhashLifetime
        | TransactionMessageWithDurableNonceLifetime
      )
  >;
}>;

export function getDefaultInstructionPlanExecutor(
  config: DefaultInstructionPlanExecutorConfig
): InstructionPlanExecutor {
  const {
    rpc,
    commitment,
    getDefaultMessage,
    parallelChunkSize: chunkSize,
    simulateComputeUnitLimit: shouldSimulateComputeUnitLimit,
  } = config;
  const sendAndConfirm = sendAndConfirmTransactionFactory(config);

  return async (plan, config) => {
    const handleMessage = async (plan: MessageInstructionPlan) => {
      const defaultMessage = await getDefaultMessage(config);
      let message = getTransactionMessageFromPlan(defaultMessage, plan);

      if (shouldSimulateComputeUnitLimit) {
        message = await setComputeUnitLimitBySimulatingTransaction(
          message,
          rpc
        );
      }

      const tx = (await signTransactionMessageWithSigners(
        message
      )) as FullySignedTransaction & TransactionWithBlockhashLifetime;
      await sendAndConfirm(tx, {
        ...config,
        commitment: commitment ?? 'confirmed',
        skipPreflight: shouldSimulateComputeUnitLimit,
      });
    };

    const executor = pipe(createInstructionPlanExecutor(handleMessage), (e) =>
      chunkSize ? chunkParallelInstructionPlans(e, chunkSize) : e
    );

    return await executor(plan, config);
  };
}

async function setComputeUnitLimitBySimulatingTransaction<
  TTransactionMessage extends
    CompilableTransactionMessage = CompilableTransactionMessage,
>(
  message: TTransactionMessage,
  rpc: Rpc<SimulateTransactionApi>
): Promise<TTransactionMessage> {
  const instructionIndex = message.instructions.findIndex((instruction) => {
    return (
      instruction.programAddress === COMPUTE_BUDGET_PROGRAM_ADDRESS &&
      identifyComputeBudgetInstruction(instruction.data as Uint8Array) ===
        ComputeBudgetInstruction.SetComputeUnitLimit
    );
  });

  // Ignore if no compute unit limit instruction is found.
  if (instructionIndex === -1) {
    return message;
  }

  const limit = await getComputeUnitLimitBySimulatingTransaction(message, rpc);

  // Ignore if the limit is not found.
  if (limit === undefined) {
    return message;
  }

  return Object.freeze({
    ...message,
    instructions: [
      ...message.instructions.slice(0, instructionIndex),
      getSetComputeUnitLimitInstruction({
        // Use a 1.1x multiplier to the computed limit.
        units: Number((limit * 110n) / 100n),
      }),
      ...message.instructions.slice(instructionIndex + 1),
    ],
  } as TTransactionMessage);
}

async function getComputeUnitLimitBySimulatingTransaction<
  TTransactionMessage extends
    CompilableTransactionMessage = CompilableTransactionMessage,
>(
  message: TTransactionMessage,
  rpc: Rpc<SimulateTransactionApi>
): Promise<bigint | undefined> {
  const tx = getBase64EncodedWireTransaction(compileTransaction(message));
  const result = await rpc
    .simulateTransaction(tx, { encoding: 'base64' })
    .send();
  return result.value.unitsConsumed;
}
