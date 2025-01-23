import { getCreateMetadataInstructions } from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  getDefaultInstructionPlanContext,
  getPdaDetails,
  sendInstructionPlanAndGetMetadataResponse,
} from './internals';
import { getUpdateMetadataInstructions } from './updateMetadata';
import { MetadataInput } from './utils';

export async function uploadMetadata(input: MetadataInput) {
  const context = getDefaultInstructionPlanContext(input);
  const [pdaDetails, defaultMessage] = await Promise.all([
    getPdaDetails(input),
    context.createMessage(),
  ]);
  const extendedInput = { ...input, ...pdaDetails, defaultMessage };
  const metadataAccount = await fetchMaybeMetadata(
    input.rpc,
    pdaDetails.metadata
  );

  // Create metadata if it doesn't exist.
  if (!metadataAccount.exists) {
    return await sendInstructionPlanAndGetMetadataResponse(
      await getCreateMetadataInstructions(extendedInput),
      context,
      extendedInput
    );
  }

  // Update metadata if it exists.
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }
  return await sendInstructionPlanAndGetMetadataResponse(
    await getUpdateMetadataInstructions({
      ...extendedInput,
      currentDataLength: BigInt(metadataAccount.data.data.length),
    }),
    context,
    extendedInput
  );
}
