import {
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  Rpc,
} from '@solana/kit';
import { getCreateMetadataInstructionPlan } from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
} from './instructionPlans';
import { getPdaDetails } from './internals';
import { getUpdateMetadataInstructionPlan } from './updateMetadata';
import { MetadataInput, MetadataResponse } from './utils';

export async function writeMetadata(
  input: MetadataInput & {
    rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlanExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse> {
  const planner = createDefaultTransactionPlanner({
    feePayer: input.payer,
    computeUnitPrice: input.priorityFees,
  });
  const executor = createDefaultTransactionPlanExecutor({
    rpc: input.rpc,
    rpcSubscriptions: input.rpcSubscriptions,
    parallelChunkSize: 5,
  });

  const { programData, isCanonical, metadata } = await getPdaDetails(input);
  const metadataAccount = await fetchMaybeMetadata(input.rpc, metadata);
  const extendedInput = {
    ...input,
    programData: isCanonical ? programData : undefined,
    planner,
  };

  const instructionPlan = metadataAccount.exists
    ? await getUpdateMetadataInstructionPlan({
        ...extendedInput,
        metadata: metadataAccount,
      })
    : await getCreateMetadataInstructionPlan({ ...extendedInput, metadata });

  const transactionPlan = await planner(instructionPlan);
  const result = await executor(transactionPlan);
  return { metadata, result };
}
