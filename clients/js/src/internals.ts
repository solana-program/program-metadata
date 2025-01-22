import {
  Address,
  appendTransactionMessageInstructions,
  Commitment,
  CompilableTransactionMessage,
  createTransactionMessage,
  GetAccountInfoApi,
  GetLatestBlockhashApi,
  IInstruction,
  pipe,
  Rpc,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  TransactionMessageWithBlockhashLifetime,
  TransactionSigner,
} from '@solana/web3.js';
import { findMetadataPda, SeedArgs } from './generated';
import { getProgramAuthority } from './utils';

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

export function getDefaultCreateMessage(
  rpc: Rpc<GetLatestBlockhashApi>,
  payer: TransactionSigner
): () => Promise<
  CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime
> {
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);
  return async () => {
    const latestBlockhash = await getBlockhash();
    return pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(payer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx)
    );
  };
}

function getTimedCacheFunction<T>(
  fn: () => Promise<T>,
  timeoutInMilliseconds: number
): () => Promise<T> {
  let cache: T | null = null;
  let cacheExpiryTimer: NodeJS.Timeout | null = null;
  return async () => {
    // Cache hit.
    if (cache && cacheExpiryTimer) {
      return cache;
    }

    // Cache miss.
    cache = await fn();
    cacheExpiryTimer = setTimeout(() => {
      cache = null;
      cacheExpiryTimer = null;
    }, timeoutInMilliseconds);
    return cache;
  };
}

async function signAndSendTransaction(
  transactionMessage: CompilableTransactionMessage &
    TransactionMessageWithBlockhashLifetime,
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>,
  commitment: Commitment = 'confirmed'
) {
  const tx = await signTransactionMessageWithSigners(transactionMessage);
  await sendAndConfirm(tx, { commitment });
}

export type SequentialInstructionPlan = {
  kind: 'sequential';
  plans: InstructionPlan[];
};
export type ParallelInstructionPlan = {
  kind: 'parallel';
  plans: InstructionPlan[];
};
export type MessageInstructionPlan = {
  kind: 'message';
  instructions: IInstruction[];
};
export type InstructionPlan =
  | SequentialInstructionPlan
  | ParallelInstructionPlan
  | MessageInstructionPlan;

export async function sendInstructionPlan(
  plan: InstructionPlan,
  createMessage: () => Promise<
    CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime
  >,
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>
) {
  switch (plan.kind) {
    case 'sequential':
      return await sendSequentialInstructionPlan(
        plan,
        createMessage,
        sendAndConfirm
      );
    case 'parallel':
      return await sendParallelInstructionPlan(
        plan,
        createMessage,
        sendAndConfirm
      );
    case 'message':
      return await sendMessageInstructionPlan(
        plan,
        createMessage,
        sendAndConfirm
      );
    default:
      throw new Error('Unsupported instruction plan');
  }
}

async function sendSequentialInstructionPlan(
  plan: SequentialInstructionPlan,
  createMessage: Parameters<typeof sendInstructionPlan>[1],
  sendAndConfirm: Parameters<typeof sendInstructionPlan>[2]
) {
  for (const subPlan of plan.plans) {
    await sendInstructionPlan(subPlan, createMessage, sendAndConfirm);
  }
}

async function sendParallelInstructionPlan(
  plan: ParallelInstructionPlan,
  createMessage: Parameters<typeof sendInstructionPlan>[1],
  sendAndConfirm: Parameters<typeof sendInstructionPlan>[2]
) {
  await Promise.all(
    plan.plans.map((subPlan) =>
      sendInstructionPlan(subPlan, createMessage, sendAndConfirm)
    )
  );
}

async function sendMessageInstructionPlan(
  plan: MessageInstructionPlan,
  createMessage: Parameters<typeof sendInstructionPlan>[1],
  sendAndConfirm: Parameters<typeof sendInstructionPlan>[2]
) {
  await pipe(
    await createMessage(),
    (tx) => appendTransactionMessageInstructions(plan.instructions, tx),
    (tx) => signAndSendTransaction(tx, sendAndConfirm)
  );
}
