import {
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  FullySignedTransaction,
  pipe,
  signTransactionMessageWithSigners,
  TransactionMessageWithBlockhashLifetime,
  TransactionMessageWithDurableNonceLifetime,
  TransactionWithLifetime,
} from '@solana/web3.js';
import { MessageInstructionPlan } from './instructionPlan';
import {
  chunkParallelInstructionPlans,
  createInstructionPlanExecutor,
  InstructionPlanExecutor,
} from './instructionPlanExecutor';

export type DefaultInstructionPlanExecutorConfig = Readonly<{
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
  simulateComputeUnitLimit?: boolean; // TODO

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

  /**
   * Sends and confirms a constructed transaction.
   */
  sendAndConfirm: (
    transaction: FullySignedTransaction & TransactionWithLifetime,
    config?: { abortSignal?: AbortSignal }
  ) => Promise<void>;
}>;

export function getDefaultInstructionPlanExecutor(
  config: DefaultInstructionPlanExecutorConfig
): InstructionPlanExecutor {
  const {
    getDefaultMessage,
    parallelChunkSize: chunkSize,
    sendAndConfirm,
  } = config;

  return async (plan, config) => {
    const handleMessage = async (plan: MessageInstructionPlan) => {
      const tx = await pipe(
        await getDefaultMessage(config),
        (tx) => appendTransactionMessageInstructions(plan.instructions, tx),
        (tx) => signTransactionMessageWithSigners(tx)
      );
      await sendAndConfirm(tx, config);
    };

    const executor = pipe(createInstructionPlanExecutor(handleMessage), (e) =>
      chunkSize ? chunkParallelInstructionPlans(e, chunkSize) : e
    );

    return await executor(plan, config);
  };
}
