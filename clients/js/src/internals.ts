import {
  estimateAndUpdateProvisoryComputeUnitLimitFactory,
  estimateComputeUnitLimitFactory,
  fillProvisorySetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from '@solana-program/compute-budget';
import {
  Address,
  assertIsSendableTransaction,
  createTransactionMessage,
  createTransactionPlanExecutor,
  createTransactionPlanner,
  GetAccountInfoApi,
  GetLatestBlockhashApi,
  InstructionPlan,
  MicroLamports,
  pipe,
  Rpc,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  SimulateTransactionApi,
  TransactionPlanner,
  TransactionSigner,
} from '@solana/kit';
import { findMetadataPda, SeedArgs } from './generated';
import { getProgramAuthority } from './utils';

export const REALLOC_LIMIT = 10_240;

export type PdaDetails = {
  metadata: Address;
  isCanonical: boolean;
  programData?: Address;
};

export async function getPdaDetails(input: {
  rpc: Rpc<GetAccountInfoApi>;
  program: Address;
  authority: TransactionSigner | Address;
  seed: SeedArgs;
}): Promise<PdaDetails> {
  const authorityAddress =
    typeof input.authority === 'string'
      ? input.authority
      : input.authority.address;
  const { authority, programData } = await getProgramAuthority(
    input.rpc,
    input.program
  );
  const isCanonical = !!authority && authority === authorityAddress;
  const [metadata] = await findMetadataPda({
    program: input.program,
    authority: isCanonical ? null : authorityAddress,
    seed: input.seed,
  });
  return { metadata, isCanonical, programData };
}

export function createDefaultTransactionPlannerAndExecutor(input: {
  concurrency?: number;
  payer: TransactionSigner;
  priorityFees?: MicroLamports;
  rpc: Parameters<typeof sendAndConfirmTransactionFactory>[0]['rpc'] &
    Rpc<GetLatestBlockhashApi & SimulateTransactionApi>;
  rpcSubscriptions: Parameters<
    typeof sendAndConfirmTransactionFactory
  >[0]['rpcSubscriptions'];
}) {
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory(input);
  const estimateCULimit = estimateComputeUnitLimitFactory(input);
  const estimateAndSetCULimit =
    estimateAndUpdateProvisoryComputeUnitLimitFactory(estimateCULimit);

  const planner = createTransactionPlanner({
    createTransactionMessage: () =>
      pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayerSigner(input.payer, m),
        (m) => fillProvisorySetComputeUnitLimitInstruction(m),
        (m) =>
          input.priorityFees
            ? setTransactionMessageComputeUnitPrice(input.priorityFees, m)
            : m
      ),
  });

  const executor = createTransactionPlanExecutor({
    executeTransactionMessage: limitFunction(async (message, config) => {
      const { value: latestBlockhash } = await input.rpc
        .getLatestBlockhash()
        .send();
      const transaction = await pipe(
        setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
        async (m) => await estimateAndSetCULimit(m, config),
        async (m) => await signTransactionMessageWithSigners(await m, config)
      );
      assertIsSendableTransaction(transaction);
      await sendAndConfirmTransaction(transaction, {
        ...config,
        commitment: 'confirmed',
      });
      return { transaction };
    }, input.concurrency ?? 5),
  });

  return { planner, executor };
}

export async function isValidInstructionPlan(
  instructionPlan: InstructionPlan,
  planner: TransactionPlanner
) {
  try {
    await planner(instructionPlan);
    return true;
  } catch {
    return false;
  }
}

function limitFunction<TArguments extends unknown[], TReturnType>(
  fn: (...args: TArguments) => PromiseLike<TReturnType>,
  concurrency: number
): (...args: TArguments) => Promise<TReturnType> {
  let running = 0;
  const queue: Array<{
    args: TArguments;
    resolve: (value: TReturnType) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  function process() {
    // Do nothing if we're still running at max concurrency
    // or if there's nothing left to process.
    if (running >= concurrency || queue.length === 0) return;

    running++;
    const { args, resolve, reject } = queue.shift()!;

    Promise.resolve(fn(...args))
      .then(resolve)
      .catch(reject)
      .finally(() => {
        running--;
        process();
      });
  }

  return function (...args) {
    return new Promise((resolve, reject) => {
      queue.push({ args, resolve, reject });
      process();
    });
  };
}
