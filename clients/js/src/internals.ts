import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from '@solana-program/compute-budget';
import {
  Address,
  CompilableTransactionMessage,
  createTransactionMessage,
  GetAccountInfoApi,
  GetLatestBlockhashApi,
  IInstruction,
  MicroLamports,
  pipe,
  ReadonlyUint8Array,
  Rpc,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  TransactionMessageWithBlockhashLifetime,
  TransactionSigner,
} from '@solana/kit';
import {
  findMetadataPda,
  getExtendInstruction,
  getWriteInstruction,
  SeedArgs,
} from './generated';
import {
  getLinearIterableInstructionPlan,
  getReallocIterableInstructionPlan,
  IterableInstructionPlan,
} from './instructionPlansDraft';
import { getProgramAuthority, MetadataInput } from './utils';

export const REALLOC_LIMIT = 10_240;

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

export function getExtendInstructionPlan__NEW(input: {
  account: Address;
  authority: TransactionSigner;
  extraLength: number;
  program?: Address;
  programData?: Address;
}): IterableInstructionPlan {
  return getReallocIterableInstructionPlan({
    totalSize: input.extraLength,
    getInstruction: (size) =>
      getExtendInstruction({
        account: input.account,
        authority: input.authority,
        length: size,
        program: input.program,
        programData: input.programData,
      }),
  });
}

export function getWriteInstructionPlan__NEW(input: {
  buffer: Address;
  authority: TransactionSigner;
  data: ReadonlyUint8Array;
}): IterableInstructionPlan {
  return getLinearIterableInstructionPlan({
    totalLength: input.data.length,
    getInstruction: (offset, length) =>
      getWriteInstruction({
        buffer: input.buffer,
        authority: input.authority,
        offset,
        data: input.data.slice(offset, offset + length),
      }),
  });
}
