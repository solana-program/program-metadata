import {
  generateKeyPairSigner,
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  lamports,
  Rpc,
} from '@solana/kit';
import {
  getCreateMetadataInstructionPlanUsingBuffer,
  getCreateMetadataInstructionPlanUsingInstructionData,
} from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
} from './instructionPlans';
import { getPdaDetails } from './internals';
import {
  getUpdateMetadataInstructionPlanUsingBuffer,
  getUpdateMetadataInstructionPlanUsingInstructionData,
} from './updateMetadata';
import { getAccountSize, MetadataInput, MetadataResponse } from './utils';

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

  const [{ programData, isCanonical, metadata }, rent] = await Promise.all([
    getPdaDetails(input),
    input.rpc
      .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
      .send(),
  ]);

  const metadataAccount = await fetchMaybeMetadata(input.rpc, metadata);

  if (!metadataAccount.exists) {
    const extendedInput = {
      ...input,
      programData: isCanonical ? programData : undefined,
      metadata,
      rent,
    };

    const transactionPlan = await planner(
      getCreateMetadataInstructionPlanUsingInstructionData(extendedInput)
    ).catch(() =>
      planner(getCreateMetadataInstructionPlanUsingBuffer(extendedInput))
    );

    const result = await executor(transactionPlan);
    return { metadata, result };
  }

  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }

  const sizeDifference =
    BigInt(input.data.length) - BigInt(metadataAccount.data.data.length);
  const extraRentPromise =
    sizeDifference > 0
      ? input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : Promise.resolve(lamports(0n));
  const [extraRent, buffer] = await Promise.all([
    extraRentPromise,
    generateKeyPairSigner(),
  ]);

  const extendedInput = {
    ...input,
    programData: isCanonical ? programData : undefined,
    metadata,
    buffer,
    bufferRent: rent,
    extraRent,
    sizeDifference,
  };

  const transactionPlan = await planner(
    getUpdateMetadataInstructionPlanUsingInstructionData(extendedInput)
  ).catch(() =>
    planner(getUpdateMetadataInstructionPlanUsingBuffer(extendedInput))
  );

  const result = await executor(transactionPlan);
  return { metadata, result };
}
