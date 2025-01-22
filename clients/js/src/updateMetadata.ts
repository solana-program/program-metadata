import { getTransferSolInstruction } from '@solana-program/system';
import {
  generateKeyPairSigner,
  lamports,
  Lamports,
  TransactionSigner,
} from '@solana/web3.js';
import {
  fetchMetadata,
  getAllocateInstruction,
  getSetDataInstruction,
  getWriteInstruction,
} from './generated';
import {
  getPdaDetails,
  InstructionPlan,
  MessageInstructionPlan,
  PdaDetails,
  sendInstructionPlan,
} from './internals';
import { getAccountSize, MetadataInput } from './utils';

const SIZE_THRESHOLD_FOR_UPDATING_WITH_BUFFER = 200;
const WRITE_CHUNK_SIZE = 900;

export async function updateMetadata(input: MetadataInput) {
  const pdaDetails = await getPdaDetails(input);
  const metadataAccount = await fetchMetadata(input.rpc, pdaDetails.metadata);
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }
  const extendedInput = {
    currentDataLength: BigInt(metadataAccount.data.data.length),
    ...input,
    ...pdaDetails,
  };
  const plan = getUpdateMetadataInstructions(extendedInput);
  await sendInstructionPlan(plan);
  return extendedInput.metadata;
}

export async function getUpdateMetadataInstructions(
  input: Omit<MetadataInput, 'rpcSubscriptions'> &
    PdaDetails & { currentDataLength: bigint }
): Promise<InstructionPlan> {
  const newDataLength = BigInt(input.data.length);
  const useBuffer = newDataLength >= SIZE_THRESHOLD_FOR_UPDATING_WITH_BUFFER; // TODO: Compute.
  const chunkSize = WRITE_CHUNK_SIZE; // TODO: Ask for createMessage to return the chunk size.
  const sizeDifference = newDataLength - BigInt(input.currentDataLength);
  const extraRent =
    sizeDifference > 0
      ? await input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : lamports(0n);

  if (!useBuffer) {
    return getUpdateMetadataInstructionsUsingInstructionData({
      ...input,
      sizeDifference,
      extraRent,
    });
  }

  const newAccountSize = getAccountSize(newDataLength);
  const [buffer, bufferRent] = await Promise.all([
    generateKeyPairSigner(),
    input.rpc.getMinimumBalanceForRentExemption(newAccountSize).send(),
  ]);
  return getUpdateMetadataInstructionsUsingBuffer({
    ...input,
    sizeDifference,
    extraRent,
    bufferRent,
    buffer,
    chunkSize,
  });
}

export function getUpdateMetadataInstructionsUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      sizeDifference: bigint;
      extraRent: Lamports;
    }
): MessageInstructionPlan {
  const plan: InstructionPlan = { kind: 'message', instructions: [] };

  if (input.sizeDifference > 0) {
    plan.instructions.push(
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: input.extraRent,
      })
    );
  }

  // TODO: Use extend instruction if sizeDifference > 10KB.

  plan.instructions.push(
    getSetDataInstruction({
      ...input,
      programData: input.isCanonical ? input.programData : undefined,
      buffer: undefined,
    })
  );

  if (input.sizeDifference < 0) {
    // TODO: Trim to withdraw excess lamports.
  }

  return plan;
}

export function getUpdateMetadataInstructionsUsingBuffer(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      chunkSize: number;
      sizeDifference: bigint;
      extraRent: Lamports;
      bufferRent: Lamports;
      buffer: TransactionSigner;
    }
): InstructionPlan {
  const mainPlan: InstructionPlan = { kind: 'sequential', plans: [] };
  const initialMessage: InstructionPlan = { kind: 'message', instructions: [] };

  if (input.sizeDifference > 0) {
    initialMessage.instructions.push(
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: input.extraRent,
      })
    );
  }

  // TODO: Use extend on metadata instruction if sizeDifference > 10KB.
  // TODO: Use extend on buffer.

  initialMessage.instructions.push(
    getTransferSolInstruction({
      source: input.payer,
      destination: input.buffer.address,
      amount: input.bufferRent,
    }),
    getAllocateInstruction({
      buffer: input.buffer.address,
      authority: input.buffer,
    })
  );
  mainPlan.plans.push(initialMessage);

  let offset = 0;
  const writePlan: InstructionPlan = { kind: 'parallel', plans: [] };
  while (offset < input.data.length) {
    writePlan.plans.push({
      kind: 'message',
      instructions: [
        getWriteInstruction({
          buffer: input.buffer.address,
          authority: input.buffer,
          data: input.data.slice(offset, offset + input.chunkSize),
        }),
      ],
    });
    offset += input.chunkSize;
  }
  mainPlan.plans.push(writePlan);

  const finalizeMessage: InstructionPlan = {
    kind: 'message',
    instructions: [],
  };
  finalizeMessage.instructions.push(
    getSetDataInstruction({
      ...input,
      buffer: input.buffer.address,
      programData: input.isCanonical ? input.programData : undefined,
    })
  );

  if (input.closeBuffer) {
    // TODO: Close buffer account.
  }

  if (input.sizeDifference < 0) {
    // TODO: Trim to withdraw excess lamports.
  }

  mainPlan.plans.push(finalizeMessage);

  return mainPlan;
}
