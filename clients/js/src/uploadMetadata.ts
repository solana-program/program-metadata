import { sendAndConfirmTransactionFactory } from '@solana/web3.js';
import { getCreateMetadataInstructions } from './createMetadata';
import { fetchMaybeMetadata } from './generated';
import {
  getDefaultCreateMessage,
  getPdaDetails,
  sendInstructionPlan,
} from './internals';
import { getUpdateMetadataInstructions } from './updateMetadata';
import { MetadataInput } from './utils';

export async function uploadMetadata(input: MetadataInput) {
  const pdaDetails = await getPdaDetails(input);
  const metadataAccount = await fetchMaybeMetadata(
    input.rpc,
    pdaDetails.metadata
  );
  const extendedInput = { ...input, ...pdaDetails };

  // Create metadata if it doesn't exist.
  if (!metadataAccount.exists) {
    const plan = await getCreateMetadataInstructions(extendedInput);
    const createMessage =
      input.createMessage ?? getDefaultCreateMessage(input.rpc, input.payer);
    const sendAndConfirm = sendAndConfirmTransactionFactory(input);
    await sendInstructionPlan(plan, createMessage, sendAndConfirm);
    return { metadata: extendedInput.metadata };
  }

  // Update metadata if it exists.
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }
  const plan = await getUpdateMetadataInstructions({
    ...extendedInput,
    currentDataLength: BigInt(metadataAccount.data.data.length),
  });
  const createMessage =
    input.createMessage ?? getDefaultCreateMessage(input.rpc, input.payer);
  const sendAndConfirm = sendAndConfirmTransactionFactory(input);
  await sendInstructionPlan(plan, createMessage, sendAndConfirm);
  return { metadata: extendedInput.metadata };
}
