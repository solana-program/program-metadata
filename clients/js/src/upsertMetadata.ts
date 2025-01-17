import { getCreateMetadataInstructions } from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  getPdaDetails,
  sendInstructionsInSequentialTransactions,
} from './internals';
import {
  getUpdateMetadataInstructions,
  getUpdateMetadataStrategy,
} from './updateMetadata';
import { getAccountSize, MetadataInput } from './utils';

export async function upsertMetadata(input: MetadataInput) {
  const pdaDetails = await getPdaDetails(input);
  const metadataAccount = await fetchMaybeMetadata(
    input.rpc,
    pdaDetails.metadata
  );

  // Create metadata if it doesn't exist.
  if (!metadataAccount.exists) {
    const rent = await input.rpc
      .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
      .send();
    const extendedInput = { rent, ...input, ...pdaDetails };
    const instructions = getCreateMetadataInstructions(extendedInput);
    await sendInstructionsInSequentialTransactions({ instructions, ...input });
    return extendedInput.metadata;
  }

  // Update metadata if it exists.
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }
  const currentDataLength = getAccountSize(metadataAccount.data.data.length);
  const newDataLength = getAccountSize(input.data.length);
  const strategy = await getUpdateMetadataStrategy(
    input.rpc,
    currentDataLength,
    newDataLength
  );
  const extendedInput = { strategy, ...input, ...pdaDetails };
  const instructions = getUpdateMetadataInstructions(extendedInput);
  await sendInstructionsInSequentialTransactions({ instructions, ...input });
  return extendedInput.metadata;
}
