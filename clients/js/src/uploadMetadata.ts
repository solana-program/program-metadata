import {
  generateKeyPairSigner,
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  lamports,
  Rpc,
} from '@solana/kit';
import {
  getCreateMetadataInstructionPlanUsingBuffer__NEW,
  getCreateMetadataInstructionPlanUsingInstructionData__NEW,
} from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
} from './instructionPlansDraft';
import { getPdaDetails } from './internals';
import {
  getUpdateMetadataInstructionPlanUsingBuffer__NEW,
  getUpdateMetadataInstructionPlanUsingInstructionData__NEW,
} from './updateMetadata';
import {
  getAccountSize,
  MetadataInput__NEW,
  MetadataResponse__NEW,
} from './utils';

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
