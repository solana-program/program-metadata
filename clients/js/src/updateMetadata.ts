import { getTransferSolInstruction } from '@solana-program/system';
import {
  generateKeyPairSigner,
  GetMinimumBalanceForRentExemptionApi,
  IInstruction,
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

type UpdateMetadataStrategy =
  | { use: 'instructionData' }
  | { use: 'buffer'; rent: Lamports; buffer: TransactionSigner };

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
    return { use: 'buffer', rent, buffer };
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
) {
  const { strategy } = input;
  const instructions: IInstruction[][] = [];
  let currentInstructionBatch: IInstruction[] = [];

  if (input.sizeDifference > 0) {
    currentInstructionBatch.push(
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: input.extraRent,
      })
    );
  }

  // TODO: Use extend instruction if sizeDifference > 10KB.

  if (input.strategy.use === 'buffer') {
    currentInstructionBatch.push(
      getTransferSolInstruction({
        source: input.payer,
        destination: input.strategy.buffer.address,
        amount: input.strategy.rent,
      }),
      getAllocateInstruction({
        buffer: input.strategy.buffer.address,
        authority: input.strategy.buffer,
      })
    );
    instructions.push(currentInstructionBatch);
    currentInstructionBatch = [];
    let offset = 0;
    while (offset < input.data.length) {
      instructions.push([
        getWriteInstruction({
          buffer: input.strategy.buffer.address,
          authority: input.strategy.buffer,
          data: input.data.slice(offset, offset + WRITE_CHUNK_SIZE),
        }),
      ]);
      offset += WRITE_CHUNK_SIZE;
    }
  }

  currentInstructionBatch.push(
    getSetDataInstruction({
      metadata: input.metadata,
      authority: input.authority,
      buffer: strategy.use === 'buffer' ? strategy.buffer.address : undefined,
      program: input.program,
      programData: input.isCanonical ? input.programData : undefined,
      encoding: input.encoding,
      compression: input.compression,
      format: input.format,
      dataSource: input.dataSource,
      data: strategy.use === 'buffer' ? null : input.data,
    })
  );

  if (input.sizeDifference < 0 || input.strategy.use === 'buffer') {
    // TODO: Trim to withdraw excess lamports.
  }

  instructions.push(currentInstructionBatch);
  return instructions;
}
