import {
  generateKeyPairSigner,
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  lamports,
  Rpc,
} from '@solana/kit';
import {
  getCreateMetadataInstructionPlan,
  getCreateMetadataInstructionPlanUsingBuffer__NEW,
  getCreateMetadataInstructionPlanUsingInstructionData__NEW,
} from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
} from './instructionPlansDraft';
import {
  getExtendedMetadataInput,
  getMetadataInstructionPlanExecutor,
  getPdaDetails,
} from './internals';
import {
  getUpdateMetadataInstructionPlan,
  getUpdateMetadataInstructionPlanUsingBuffer__NEW,
  getUpdateMetadataInstructionPlanUsingInstructionData__NEW,
} from './updateMetadata';
import {
  getAccountSize,
  MetadataInput,
  MetadataInput__NEW,
  MetadataResponse__NEW,
} from './utils';

export async function uploadMetadata(input: MetadataInput) {
  const extendedInput = await getExtendedMetadataInput(input);
  const executor = getMetadataInstructionPlanExecutor(extendedInput);
  const metadataAccount = await fetchMaybeMetadata(
    input.rpc,
    extendedInput.metadata
  );

  // Create metadata if it doesn't exist.
  if (!metadataAccount.exists) {
    const plan = await getCreateMetadataInstructionPlan(extendedInput);
    return await executor(plan);
  }

  // Update metadata if it exists.
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }
  const plan = await getUpdateMetadataInstructionPlan({
    ...extendedInput,
    currentDataLength: BigInt(metadataAccount.data.data.length),
  });
  return await executor(plan);
}

export async function uploadMetadata__NEW(
  input: MetadataInput__NEW & {
    rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlanExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse__NEW> {
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
      getCreateMetadataInstructionPlanUsingInstructionData__NEW(extendedInput)
    ).catch(() =>
      planner(getCreateMetadataInstructionPlanUsingBuffer__NEW(extendedInput))
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
    getUpdateMetadataInstructionPlanUsingInstructionData__NEW(extendedInput)
  ).catch(() =>
    planner(getUpdateMetadataInstructionPlanUsingBuffer__NEW(extendedInput))
  );

  const result = await executor(transactionPlan);
  return { metadata, result };
}
