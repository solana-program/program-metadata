import {
  getTransferSolInstruction,
  SYSTEM_PROGRAM_ADDRESS,
} from '@solana-program/system';
import { IInstruction, Lamports } from '@solana/web3.js';
import {
  getAllocateInstruction,
  getInitializeInstruction,
  getWriteInstruction,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
  getPdaDetails,
  PdaDetails,
  sendInstructionsInSequentialTransactions,
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
  const instructions = getCreateMetadataInstructions(extendedInput);
  await sendInstructionsInSequentialTransactions({ instructions, ...input });
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
) {
  const instructions: IInstruction[][] = [];
  let currentInstructionBatch: IInstruction[] = [];
  currentInstructionBatch.push(
    getTransferSolInstruction({
      source: input.payer,
      destination: input.metadata,
      amount: input.rent,
    })
  );

  if (input.strategy.use === 'buffer') {
    currentInstructionBatch.push(
      getAllocateInstruction({
        buffer: input.metadata,
        authority: input.authority,
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
        seed: input.seed,
      })
    );
    instructions.push(currentInstructionBatch);
    currentInstructionBatch = [];
    let offset = 0;
    while (offset < input.data.length) {
      instructions.push([
        getWriteInstruction({
          buffer: input.metadata,
          authority: input.authority,
          data: input.data.slice(offset, offset + WRITE_CHUNK_SIZE),
        }),
      ]);
      offset += WRITE_CHUNK_SIZE;
    }
  }

  currentInstructionBatch.push(
    getInitializeInstruction({
      metadata: input.metadata,
      authority: input.authority,
      program: input.program,
      programData: input.isCanonical ? input.programData : undefined,
      seed: input.seed,
      encoding: input.encoding,
      compression: input.compression,
      format: input.format,
      dataSource: input.dataSource,
      data: input.strategy.use === 'buffer' ? null : input.data,
      system:
        input.strategy.use === 'buffer'
          ? PROGRAM_METADATA_PROGRAM_ADDRESS
          : SYSTEM_PROGRAM_ADDRESS,
    })
  );

  instructions.push(currentInstructionBatch);
  return instructions;
}
