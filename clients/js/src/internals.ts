import {
  Address,
  GetAccountInfoApi,
  ReadonlyUint8Array,
  Rpc,
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
} from './instructionPlans';
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
