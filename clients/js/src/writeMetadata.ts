import {
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  MaybeAccount,
  Rpc,
} from '@solana/kit';
import { getCreateMetadataInstructionPlan } from './createMetadata';
import { fetchBuffer, fetchMaybeMetadata, Metadata } from './generated';
import {
  createDefaultTransactionPlanExecutor,
  InstructionPlan,
} from './instructionPlans';
import {
  getDefaultTransactionPlannerAndExecutor,
  getPdaDetails,
} from './internals';
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
  const { planner, executor } = getDefaultTransactionPlannerAndExecutor(input);
  const { programData, isCanonical, metadata } = await getPdaDetails(input);
  const [metadataAccount, buffer] = await Promise.all([
    fetchMaybeMetadata(input.rpc, metadata),
    input.buffer
      ? fetchBuffer(input.rpc, input.buffer)
      : Promise.resolve(undefined),
  ]);

  const instructionPlan = await getWriteMetadataInstructionPlan({
    ...input,
    buffer,
    metadata: metadataAccount,
    programData: isCanonical ? programData : undefined,
    planner,
  });

  const transactionPlan = await planner(instructionPlan);
  const result = await executor(transactionPlan);
  return { metadata, result };
}

export async function getWriteMetadataInstructionPlan(
  input: Omit<
    Parameters<typeof getCreateMetadataInstructionPlan>[0],
    'metadata'
  > & {
    metadata: MaybeAccount<Metadata>;
  }
): Promise<InstructionPlan> {
  return input.metadata.exists
    ? await getUpdateMetadataInstructionPlan({
        ...input,
        metadata: input.metadata,
        data: input.data!, // TODO: Temporary.
      })
    : await getCreateMetadataInstructionPlan({
        ...input,
        metadata: input.metadata.address,
      });
}
