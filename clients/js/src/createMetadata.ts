import { getTransferSolInstruction } from '@solana-program/system';
import {
  CompilableTransactionMessage,
  GetMinimumBalanceForRentExemptionApi,
  Lamports,
  Rpc,
} from '@solana/web3.js';
import {
  getAllocateInstruction,
  getInitializeInstruction,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
  calculateMaxChunkSize,
  getComputeUnitInstructions,
  getDefaultInstructionPlanContext,
  getPdaDetails,
  getTransactionMessageFromPlan,
  getWriteInstructionPlan,
  InstructionPlan,
  messageFitsInOneTransaction,
  MessageInstructionPlan,
  PdaDetails,
  sendInstructionPlanAndGetMetadataResponse,
} from './internals';
import { getAccountSize, MetadataInput, MetadataResponse } from './utils';

export async function createMetadata(
  input: MetadataInput
): Promise<MetadataResponse> {
  const context = getDefaultInstructionPlanContext(input);
  const [pdaDetails, defaultMessage] = await Promise.all([
    getPdaDetails(input),
    context.createMessage(),
  ]);
  const extendedInput = { ...input, ...pdaDetails, defaultMessage };
  return await sendInstructionPlanAndGetMetadataResponse(
    await getCreateMetadataInstructions(extendedInput),
    context,
    extendedInput
  );
}

export async function getCreateMetadataInstructions(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      rpc: Rpc<GetMinimumBalanceForRentExemptionApi>;
      defaultMessage: CompilableTransactionMessage;
    }
): Promise<InstructionPlan> {
  const rent = await input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
    .send();
  const planUsingInstructionData =
    getCreateMetadataInstructionsUsingInstructionData({ ...input, rent });
  const messageUsingInstructionData = getTransactionMessageFromPlan(
    input.defaultMessage,
    planUsingInstructionData
  );
  const useBuffer =
    input.buffer === undefined
      ? !messageFitsInOneTransaction(messageUsingInstructionData)
      : !!input.buffer;

  if (!useBuffer) {
    return planUsingInstructionData;
  }

  const chunkSize = calculateMaxChunkSize(input.defaultMessage, {
    ...input,
    buffer: input.metadata,
  });
  return getCreateMetadataInstructionsUsingBuffer({
    ...input,
    chunkSize,
    rent,
  });
}

export function getCreateMetadataInstructionsUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & { rent: Lamports }
): MessageInstructionPlan {
  return {
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: undefined, // TODO: Add max CU for each instruction.
      }),
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
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: undefined, // TODO: Add max CU for each instruction.
      }),
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
    writePlan.plans.push(
      getWriteInstructionPlan({
        buffer: input.metadata,
        authority: input.authority,
        data: input.data.slice(offset, offset + input.chunkSize),
        priorityFees: input.priorityFees,
      })
    );
    offset += input.chunkSize;
  }
  mainPlan.plans.push(writePlan);

  mainPlan.plans.push({
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: undefined, // TODO: Add max CU for each instruction.
      }),
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
