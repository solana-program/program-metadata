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
const WRITE_CHUNK_SIZE = 800;

export async function updateMetadata(input: MetadataInput) {
  const pdaDetails = await getPdaDetails(input);
  const metadataAccount = await fetchMetadata(input.rpc, pdaDetails.metadata);
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

type UpdateMetadataStrategy =
  | { use: 'instructionData'; extraRent: Lamports; sizeDifference: bigint }
  | { use: 'buffer'; rent: Lamports; buffer: TransactionSigner };

export async function getUpdateMetadataStrategy(
  rpc: Rpc<GetMinimumBalanceForRentExemptionApi>,
  currentDataLength: bigint | number,
  newDataLength: bigint | number
): Promise<UpdateMetadataStrategy> {
  const sizeDifference = BigInt(newDataLength) - BigInt(currentDataLength);
  const useBuffer = newDataLength >= SIZE_THRESHOLD_FOR_UPDATING_WITH_BUFFER;
  if (useBuffer) {
    const [buffer, rent] = await Promise.all([
      generateKeyPairSigner(),
      rpc.getMinimumBalanceForRentExemption(BigInt(newDataLength)).send(),
    ]);
    return { use: 'buffer', rent, buffer };
  }
  const extraRent =
    sizeDifference > 0
      ? await rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : lamports(0n);
  return { use: 'instructionData', extraRent, sizeDifference };
}

export function getUpdateMetadataInstructions(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & { strategy: UpdateMetadataStrategy }
) {
  const { strategy } = input;
  const instructions: IInstruction[][] = [];
  let currentInstructionBatch: IInstruction[] = [];

  if (strategy.use === 'buffer') {
    currentInstructionBatch.push(
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: strategy.rent,
      }),
      getAllocateInstruction({
        buffer: strategy.buffer.address,
        authority: strategy.buffer,
      })
    );
    instructions.push(currentInstructionBatch);
    currentInstructionBatch = [];
    let offset = 0;
    while (offset < input.data.length) {
      instructions.push([
        getWriteInstruction({
          buffer: strategy.buffer.address,
          authority: strategy.buffer,
          data: input.data.slice(offset, offset + WRITE_CHUNK_SIZE),
        }),
      ]);
      offset += WRITE_CHUNK_SIZE;
    }
  } else if (strategy.sizeDifference > 0) {
    currentInstructionBatch.push(
      getTransferSolInstruction({
        source: input.payer,
        destination: input.metadata,
        amount: strategy.extraRent,
      })
    );
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

  // TODO: Trim to withdraw excess lamports if (useBuffer || sizeDifference < 0).

  instructions.push(currentInstructionBatch);
  return instructions;
}
