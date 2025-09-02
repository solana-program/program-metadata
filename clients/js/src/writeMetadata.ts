import {
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  InstructionPlan,
  MaybeAccount,
  Rpc,
} from '@solana/kit';
import { getCreateMetadataInstructionPlan } from './createMetadata';
import { fetchBuffer, fetchMaybeMetadata, Metadata } from './generated';
import {
  createDefaultTransactionPlannerAndExecutor,
  getPdaDetails,
} from './internals';
import { getUpdateMetadataInstructionPlan } from './updateMetadata';
import { MetadataInput, MetadataResponse } from './utils';

export async function writeMetadata(
  input: MetadataInput & {
    rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlannerAndExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlannerAndExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse> {
  const { planner, executor } =
    createDefaultTransactionPlannerAndExecutor(input);
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
      })
    : await getCreateMetadataInstructionPlan({
        ...input,
        metadata: input.metadata.address,
      });
}
