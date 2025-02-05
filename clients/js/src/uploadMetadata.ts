import { getCreateMetadataInstructionPlan } from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  getExtendedMetadataInput,
  getMetadataInstructionPlanExecutor,
} from './internals';
import { getUpdateMetadataInstructionPlan } from './updateMetadata';
import { MetadataInput } from './utils';

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
