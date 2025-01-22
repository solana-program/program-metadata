import { getTransferSolInstruction } from '@solana-program/system';
import { Lamports } from '@solana/web3.js';
import {
  getAllocateInstruction,
  getInitializeInstruction,
  getWriteInstruction,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
  getDefaultInstructionPlanContext,
  getPdaDetails,
  InstructionPlan,
  PdaDetails,
  sendInstructionPlan,
} from './internals';
import { getAccountSize, MetadataInput, MetadataResponse } from './utils';

export const SIZE_THRESHOLD_FOR_INITIALIZING_WITH_BUFFER = 200;
const WRITE_CHUNK_SIZE = 1000;

export async function createMetadata(
  input: MetadataInput
): Promise<MetadataResponse> {
  const pdaDetails = await getPdaDetails(input);
  const extendedInput = { ...input, ...pdaDetails };
  const plan = await getCreateMetadataInstructions(extendedInput);
  await sendInstructionPlan(plan, getDefaultInstructionPlanContext(input));
  return { metadata: extendedInput.metadata };
}

export async function getCreateMetadataInstructions(
  input: Omit<MetadataInput, 'rpcSubscriptions'> & PdaDetails
): Promise<InstructionPlan> {
  const useBuffer =
    input.data.length >= SIZE_THRESHOLD_FOR_INITIALIZING_WITH_BUFFER; // TODO: Compute.
  const chunkSize = WRITE_CHUNK_SIZE; // TODO: Ask for createMessage to return the chunk size.
  const rent = await input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
    .send();

  return useBuffer
    ? getCreateMetadataInstructionsUsingBuffer({ ...input, chunkSize, rent })
    : getCreateMetadataInstructionsUsingInstructionData({ ...input, rent });
}

export function getCreateMetadataInstructionsUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & { rent: Lamports }
): InstructionPlan {
  return {
    kind: 'message',
    instructions: [
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: input.rent,
      }),
      getInitializeInstruction({
        ...input,
        programData: input.isCanonical ? input.programData : undefined,
      }),
    ],
  };
}

export function getCreateMetadataInstructionsUsingBuffer(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & { rent: Lamports; chunkSize: number }
): InstructionPlan {
  const mainPlan: InstructionPlan = { kind: 'sequential', plans: [] };

  mainPlan.plans.push({
    kind: 'message',
    instructions: [
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: input.rent,
      }),
      getAllocateInstruction({
        buffer: input.metadata,
        authority: input.authority,
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
        seed: input.seed,
      }),
      // TODO: Extend buffer account.
    ],
  });

  let offset = 0;
  // TODO: Use parallel plan when the program supports it.
  const writePlan: InstructionPlan = { kind: 'sequential', plans: [] };
  while (offset < input.data.length) {
    writePlan.plans.push({
      kind: 'message',
      instructions: [
        getWriteInstruction({
          buffer: input.metadata,
          authority: input.authority,
          data: input.data.slice(offset, offset + input.chunkSize),
        }),
      ],
    });
    offset += input.chunkSize;
  }
  mainPlan.plans.push(writePlan);

  mainPlan.plans.push({
    kind: 'message',
    instructions: [
      getInitializeInstruction({
        ...input,
        programData: input.isCanonical ? input.programData : undefined,
        system: PROGRAM_METADATA_PROGRAM_ADDRESS,
        data: undefined,
      }),
    ],
  });

  return mainPlan;
}
