import {
  Address,
  GetAccountInfoApi,
  MicroLamports,
  Rpc,
  TransactionSigner,
} from '@solana/kit';
import { findMetadataPda, SeedArgs } from './generated';
import { getProgramAuthority } from './utils';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
} from './instructionPlans';

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

export function getDefaultTransactionPlannerAndExecutor(input: {
  payer: TransactionSigner;
  priorityFees?: MicroLamports;
  rpc: Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
  rpcSubscriptions: Parameters<
    typeof createDefaultTransactionPlanExecutor
  >[0]['rpcSubscriptions'];
}) {
  const planner = createDefaultTransactionPlanner({
    feePayer: input.payer,
    computeUnitPrice: input.priorityFees,
  });
  const executor = createDefaultTransactionPlanExecutor({
    rpc: input.rpc,
    rpcSubscriptions: input.rpcSubscriptions,
    parallelChunkSize: 5,
  });
  return { planner, executor };
}
