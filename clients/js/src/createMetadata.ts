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
  getTransactionMessageFromPlan,
  InstructionPlan,
  MessageInstructionPlan,
} from './instructionPlans';
import {
  calculateMaxChunkSize,
  getComputeUnitInstructions,
  getExtendedMetadataInput,
  getMetadataInstructionPlanExecutor,
  getWriteInstructionPlan,
  messageFitsInOneTransaction,
  PdaDetails,
} from './internals';
import { getAccountSize, MetadataInput, MetadataResponse } from './utils';

export async function createMetadata(
  input: MetadataInput
): Promise<MetadataResponse> {
  const extendedInput = await getExtendedMetadataInput(input);
  const executor = getMetadataInstructionPlanExecutor(extendedInput);
  const plan = await getCreateMetadataInstructionPlan(extendedInput);
  return await executor(plan);
}

export async function getCreateMetadataInstructionPlan(
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
    getCreateMetadataInstructionPlanUsingInstructionData({ ...input, rent });
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
  return getCreateMetadataInstructionPlanUsingBuffer({
    ...input,
    chunkSize,
    rent,
  });
}

export function getCreateMetadataInstructionPlanUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & { rent: Lamports }
): MessageInstructionPlan {
  return {
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: 'simulated',
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

export function getCreateMetadataInstructionPlanUsingBuffer(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & { rent: Lamports; chunkSize: number }
): InstructionPlan {
  const mainPlan: InstructionPlan = { kind: 'sequential', plans: [] };

  mainPlan.plans.push({
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: 'simulated',
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
        offset,
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
        computeUnitLimit: 'simulated',
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
