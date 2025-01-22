import { getTransferSolInstruction } from '@solana-program/system';
import { Lamports } from '@solana/web3.js';
import {
  getAllocateInstruction,
  getInitializeInstruction,
  getWriteInstruction,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
  getPdaDetails,
  InstructionPlan,
  PdaDetails,
  sendInstructionPlan,
} from './internals';
import { getAccountSize, MetadataInput } from './utils';

export const SIZE_THRESHOLD_FOR_INITIALIZING_WITH_BUFFER = 200;
const WRITE_CHUNK_SIZE = 1000;

export async function createMetadata(input: MetadataInput) {
  const [pdaDetails, rent] = await Promise.all([
    getPdaDetails(input),
    input.rpc
      .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
      .send(),
  ]);
  const strategy: CreateMetadataStrategy =
    input.data.length >= SIZE_THRESHOLD_FOR_INITIALIZING_WITH_BUFFER
      ? { use: 'buffer', extractLastTransaction: false }
      : { use: 'instructionData' };
  const extendedInput = { rent, strategy, ...input, ...pdaDetails };
  const plan = getCreateMetadataInstructions(extendedInput);
  await sendInstructionPlan(plan);
  return extendedInput.metadata;
}

export type CreateMetadataStrategy =
  | { use: 'instructionData' }
  | {
      use: 'buffer';
      extractLastTransaction: boolean; // TODO: use this.
    };

export function getCreateMetadataInstructions(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      rent: Lamports;
      strategy: CreateMetadataStrategy;
    }
): InstructionPlan {
  return input.strategy.use === 'instructionData'
    ? getCreateMetadataInstructionsUsingInstructionData(input)
    : getCreateMetadataInstructionsUsingBuffer({
        ...input,
        chunkSize: WRITE_CHUNK_SIZE,
        closeBuffer: false,
      });
}

export function getCreateMetadataInstructionsUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      rent: Lamports;
    }
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
    PdaDetails & {
      rent: Lamports;
      chunkSize: number;
      closeBuffer: boolean; // TODO: use this.
    }
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
  const writePlan: InstructionPlan = { kind: 'parallel', plans: [] };
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
      }),
    ],
  });

  return mainPlan;
}
