import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import {
  Address,
  Commitment,
  CompilableTransactionMessage,
  compileTransaction,
  createTransactionMessage,
  GetAccountInfoApi,
  GetLatestBlockhashApi,
  getTransactionEncoder,
  IInstruction,
  MicroLamports,
  pipe,
  ReadonlyUint8Array,
  Rpc,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  Transaction,
  TransactionMessageWithBlockhashLifetime,
  TransactionSigner,
} from '@solana/web3.js';
import { findMetadataPda, getWriteInstruction, SeedArgs } from './generated';
import {
  getDefaultInstructionPlanExecutor,
  getTransactionMessageFromPlan,
  InstructionPlan,
  InstructionPlanExecutor,
  MessageInstructionPlan,
} from './instructionPlans';
import { getProgramAuthority, MetadataInput, MetadataResponse } from './utils';

const TRANSACTION_SIZE_LIMIT =
  1_280 -
  40 /* 40 bytes is the size of the IPv6 header. */ -
  8; /* 8 bytes is the size of the fragment header. */

export type ExtendedMetadataInput = MetadataInput &
  PdaDetails & {
    getDefaultMessage: () => Promise<
      CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime
    >;
    defaultMessage: CompilableTransactionMessage &
      TransactionMessageWithBlockhashLifetime;
  };

export async function getExtendedMetadataInput(
  input: MetadataInput
): Promise<ExtendedMetadataInput> {
  const getDefaultMessage = getDefaultMessageFactory(input);
  const [pdaDetails, defaultMessage] = await Promise.all([
    getPdaDetails(input),
    getDefaultMessage(),
  ]);
  return { ...input, ...pdaDetails, defaultMessage, getDefaultMessage };
}

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

export function getDefaultMessageFactory(input: {
  rpc: Rpc<GetLatestBlockhashApi>;
  payer: TransactionSigner;
}): () => Promise<
  CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime
> {
  const getBlockhash = getTimedCacheFunction(async () => {
    const { value } = await input.rpc.getLatestBlockhash().send();
    return value;
  }, 60_000);
  return async () => {
    const latestBlockhash = await getBlockhash();
    return pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(input.payer, tx),
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

const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

export function getComputeUnitInstructions(input: {
  computeUnitPrice?: MicroLamports;
  computeUnitLimit?: number | 'simulated';
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
        units:
          input.computeUnitLimit === 'simulated'
            ? MAX_COMPUTE_UNIT_LIMIT
            : input.computeUnitLimit,
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
        computeUnitLimit: 'simulated',
      }),
      getWriteInstruction(input),
    ],
  };
}

export function getMetadataInstructionPlanExecutor(
  input: Pick<
    ExtendedMetadataInput,
    | 'rpc'
    | 'rpcSubscriptions'
    | 'payer'
    | 'extractLastTransaction'
    | 'metadata'
    | 'defaultMessage'
    | 'getDefaultMessage'
  > & { commitment?: Commitment }
): (
  plan: InstructionPlan,
  config?: { abortSignal?: AbortSignal }
) => Promise<MetadataResponse> {
  const executor = getDefaultInstructionPlanExecutor({
    ...input,
    simulateComputeUnitLimit: true,
    getDefaultMessage: input.getDefaultMessage,
  });

  return async (plan, config) => {
    const [planToSend, lastTransaction] = extractLastTransactionIfRequired(
      plan,
      input
    );
    await executor(planToSend, config);
    return { metadata: input.metadata, lastTransaction };
  };
}

export async function executeInstructionPlanAndGetMetadataResponse(
  plan: InstructionPlan,
  executor: InstructionPlanExecutor,
  input: {
    metadata: Address;
    defaultMessage: CompilableTransactionMessage;
    extractLastTransaction?: boolean;
  }
): Promise<MetadataResponse> {
  const [planToSend, lastTransaction] = extractLastTransactionIfRequired(
    plan,
    input
  );
  await executor(planToSend);
  return { metadata: input.metadata, lastTransaction };
}

function extractLastTransactionIfRequired(
  plan: InstructionPlan,
  input: {
    defaultMessage: CompilableTransactionMessage;
    extractLastTransaction?: boolean;
  }
): [InstructionPlan, Transaction | undefined] {
  if (!input.extractLastTransaction) {
    return [plan, undefined];
  }
  const result = extractLastMessageFromPlan(plan);
  const lastMessage = getTransactionMessageFromPlan(
    input.defaultMessage,
    result.lastMessage
  );
  return [result.plan, compileTransaction(lastMessage)];
}

function extractLastMessageFromPlan(plan: InstructionPlan): {
  plan: InstructionPlan;
  lastMessage: MessageInstructionPlan;
} {
  switch (plan.kind) {
    case 'sequential':
      // eslint-disable-next-line no-case-declarations
      const lastMessage = plan.plans[plan.plans.length - 1];
      if (lastMessage.kind !== 'message') {
        throw Error(
          `Expected last plan to be a message plan, got: ${lastMessage.kind}`
        );
      }
      return {
        plan: { kind: 'sequential', plans: plan.plans.slice(0, -1) },
        lastMessage,
      };
    case 'message':
      throw new Error(
        'This operation can be executed without a buffer. ' +
          'Therefore, the `extractLastTransaction` option is redundant. ' +
          'Use the `buffer` option to force the use of a buffer.'
      );
    case 'parallel':
    default:
      throw Error(
        `Cannot extract last transaction from plan kind: "${plan.kind}"`
      );
  }
}
