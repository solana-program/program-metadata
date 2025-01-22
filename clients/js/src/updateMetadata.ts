import { getTransferSolInstruction } from '@solana-program/system';
import {
  generateKeyPairSigner,
  GetMinimumBalanceForRentExemptionApi,
  lamports,
  Lamports,
  Rpc,
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
  PdaDetails,
  sendInstructionsInSequentialTransactions,
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

export type UpdateMetadataStrategy =
  | { use: 'instructionData' }
  | {
      use: 'buffer';
      bufferRent: Lamports;
      buffer: TransactionSigner;
      extractLastTransaction: boolean; // TODO: use this.
    };

export async function getUpdateMetadataStrategy(
  rpc: Rpc<GetMinimumBalanceForRentExemptionApi>,
  newDataLength: bigint | number
): Promise<UpdateMetadataStrategy> {
  const useBuffer = newDataLength >= SIZE_THRESHOLD_FOR_UPDATING_WITH_BUFFER;
  if (useBuffer) {
    const newAccountSize = getAccountSize(newDataLength);
    const [buffer, rent] = await Promise.all([
      generateKeyPairSigner(),
      rpc.getMinimumBalanceForRentExemption(newAccountSize).send(),
    ]);
    return {
      use: 'buffer',
      bufferRent: rent,
      buffer,
      extractLastTransaction: false,
    };
  }
  return { use: 'instructionData' };
}

export function getUpdateMetadataInstructions(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      sizeDifference: bigint;
      extraRent: Lamports;
      strategy: UpdateMetadataStrategy;
    }
): InstructionPlan {
  return input.strategy.use === 'instructionData'
    ? getUpdateMetadataInstructionsUsingInstructionData(input)
    : getUpdateMetadataInstructionsUsingBuffer({
        ...input,
        bufferRent: input.strategy.bufferRent,
        buffer: input.strategy.buffer,
        chunkSize: WRITE_CHUNK_SIZE,
        closeBuffer: false,
        extractLastTransaction: input.strategy.extractLastTransaction,
      });
}

export function getUpdateMetadataInstructionsUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      sizeDifference: bigint;
      extraRent: Lamports;
    }
): InstructionPlan {
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
      closeBuffer: boolean; // TODO: use this.
      extractLastTransaction: boolean; // TODO: use this.
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
