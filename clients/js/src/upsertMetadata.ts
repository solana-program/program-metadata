import { lamports } from '@solana/web3.js';
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
  const newDataLength = BigInt(input.data.length);
  const sizeDifference =
    newDataLength - BigInt(metadataAccount.data.data.length);
  const extraRent =
    sizeDifference > 0
      ? await input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : lamports(0n);
  const strategy = await getUpdateMetadataStrategy(input.rpc, newDataLength);
  const extendedInput = {
    sizeDifference,
    extraRent,
    strategy,
    ...input,
    ...pdaDetails,
  };
  const instructions = getUpdateMetadataInstructions(extendedInput);
  await sendInstructionsInSequentialTransactions({ instructions, ...input });
  return extendedInput.metadata;
}
