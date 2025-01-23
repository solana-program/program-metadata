import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import {
  Address,
  appendTransactionMessageInstructions,
  Commitment,
  CompilableTransactionMessage,
  compileTransaction,
  createTransactionMessage,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetMinimumBalanceForRentExemptionApi,
  GetSignatureStatusesApi,
  getTransactionEncoder,
  IInstruction,
  MicroLamports,
  pipe,
  ReadonlyUint8Array,
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
import { findMetadataPda, getWriteInstruction, SeedArgs } from './generated';
import { getProgramAuthority } from './utils';

const TRANSACTION_SIZE_LIMIT =
  1_280 -
  40 /* 40 bytes is the size of the IPv6 header. */ -
  8; /* 8 bytes is the size of the fragment header. */

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

export function getTransactionMessageFromPlan(
  defaultMessage: CompilableTransactionMessage,
  plan: MessageInstructionPlan
) {
  return pipe(defaultMessage, (tx) =>
    appendTransactionMessageInstructions(plan.instructions, tx)
  );
}

export function getComputeUnitInstructions(input: {
  computeUnitPrice?: MicroLamports;
  computeUnitLimit?: number;
}) {
  const instructions: IInstruction[] = [];
  if (input.computeUnitPrice !== undefined) {
    instructions.push(
      getSetComputeUnitPriceInstruction({
        microLamports: input.computeUnitPrice,
      })
    );
  }
  if (input.computeUnitLimit !== undefined) {
    instructions.push(
      getSetComputeUnitLimitInstruction({
        units: input.computeUnitLimit,
      })
    );
  }
  return instructions;
}

export function calculateMaxChunkSize(
  defaultMessage: CompilableTransactionMessage,
  input: {
    buffer: Address;
    authority: TransactionSigner;
    priorityFees?: MicroLamports;
  }
) {
  const plan = getWriteInstructionPlan({ ...input, data: new Uint8Array(0) });
  const message = getTransactionMessageFromPlan(defaultMessage, plan);
  return getRemainingTransactionSpaceFromMessage(message);
}

export function messageFitsInOneTransaction(
  message: CompilableTransactionMessage
): boolean {
  return getRemainingTransactionSpaceFromMessage(message) >= 0;
}

function getRemainingTransactionSpaceFromMessage(
  message: CompilableTransactionMessage
) {
  return (
    TRANSACTION_SIZE_LIMIT -
    getTransactionSizeFromMessage(message) -
    1 /* Subtract 1 byte buffer to account for shortvec encoding. */
  );
}

function getTransactionSizeFromMessage(
  message: CompilableTransactionMessage
): number {
  const transaction = compileTransaction(message);
  return getTransactionEncoder().encode(transaction).length;
}

export function getWriteInstructionPlan(input: {
  buffer: Address;
  authority: TransactionSigner;
  data: ReadonlyUint8Array;
  priorityFees?: MicroLamports;
}): MessageInstructionPlan {
  return {
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: undefined, // TODO: Add max CU for each instruction.
      }),
      getWriteInstruction(input),
    ],
  };
}
