import {
  Address,
  appendTransactionMessageInstructions,
  Commitment,
  CompilableTransactionMessage,
  createTransactionMessage,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetMinimumBalanceForRentExemptionApi,
  GetSignatureStatusesApi,
  IInstruction,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  SendTransactionApi,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  SignatureNotificationsApi,
  signTransactionMessageWithSigners,
  SlotNotificationsApi,
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

type SendInstructionPlanContext = {
  createMessage: () => Promise<
    CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime
  >;
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>;
};

export function getDefaultInstructionPlanContext(input: {
  rpc: Rpc<
    GetLatestBlockhashApi &
      GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi &
      GetMinimumBalanceForRentExemptionApi
  >;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
  payer: TransactionSigner;
}): SendInstructionPlanContext {
  return {
    createMessage: getDefaultCreateMessage(input.rpc, input.payer),
    sendAndConfirm: sendAndConfirmTransactionFactory(input),
  };
}

export async function sendInstructionPlan(
  plan: InstructionPlan,
  ctx: SendInstructionPlanContext
) {
  switch (plan.kind) {
    case 'sequential':
      return await sendSequentialInstructionPlan(plan, ctx);
    case 'parallel':
      return await sendParallelInstructionPlan(plan, ctx);
    case 'message':
      return await sendMessageInstructionPlan(plan, ctx);
    default:
      throw new Error('Unsupported instruction plan');
  }
}

async function sendSequentialInstructionPlan(
  plan: SequentialInstructionPlan,
  ctx: SendInstructionPlanContext
) {
  for (const subPlan of plan.plans) {
    await sendInstructionPlan(subPlan, ctx);
  }
}

async function sendParallelInstructionPlan(
  plan: ParallelInstructionPlan,
  ctx: SendInstructionPlanContext
) {
  await Promise.all(
    plan.plans.map((subPlan) => sendInstructionPlan(subPlan, ctx))
  );
}

async function sendMessageInstructionPlan(
  plan: MessageInstructionPlan,
  ctx: SendInstructionPlanContext
) {
  await pipe(
    await ctx.createMessage(),
    (tx) => appendTransactionMessageInstructions(plan.instructions, tx),
    (tx) => signAndSendTransaction(tx, ctx.sendAndConfirm)
  );
}
