import { getTransferSolInstruction } from '@solana-program/system';
import {
  CompilableTransactionMessage,
  generateKeyPairSigner,
  GetMinimumBalanceForRentExemptionApi,
  isTransactionSigner,
  lamports,
  Lamports,
  Rpc,
  TransactionSigner,
} from '@solana/web3.js';
import {
  fetchMetadata,
  getAllocateInstruction,
  getSetDataInstruction,
} from './generated';
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
import {
  getTransactionMessageFromPlan,
  InstructionPlan,
  MessageInstructionPlan,
} from './instructionPlans';

export async function updateMetadata(
  input: MetadataInput
): Promise<MetadataResponse> {
  const extendedInput = await getExtendedMetadataInput(input);
  const executor = getMetadataInstructionPlanExecutor(extendedInput);
  const metadataAccount = await fetchMetadata(
    input.rpc,
    extendedInput.metadata
  );
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }
  const plan = await getUpdateMetadataInstructionPlan({
    ...extendedInput,
    currentDataLength: BigInt(metadataAccount.data.data.length),
  });
  return await executor(plan);
}

export async function getUpdateMetadataInstructionPlan(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      rpc: Rpc<GetMinimumBalanceForRentExemptionApi>;
      currentDataLength: bigint;
      defaultMessage: CompilableTransactionMessage;
    }
): Promise<InstructionPlan> {
  const newDataLength = BigInt(input.data.length);
  const sizeDifference = newDataLength - BigInt(input.currentDataLength);
  const extraRent =
    sizeDifference > 0
      ? await input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : lamports(0n);
  const planUsingInstructionData =
    getUpdateMetadataInstructionPlanUsingInstructionData({
      ...input,
      sizeDifference,
      extraRent,
    });
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

  const newAccountSize = getAccountSize(newDataLength);
  const [buffer, bufferRent] = await Promise.all([
    typeof input.buffer === 'object' && isTransactionSigner(input.buffer)
      ? Promise.resolve(input.buffer)
      : generateKeyPairSigner(),
    input.rpc.getMinimumBalanceForRentExemption(newAccountSize).send(),
  ]);
  const chunkSize = calculateMaxChunkSize(input.defaultMessage, {
    ...input,
    buffer: buffer.address,
    authority: buffer,
  });
  return getUpdateMetadataInstructionPlanUsingBuffer({
    ...input,
    sizeDifference,
    extraRent,
    bufferRent,
    buffer,
    chunkSize,
  });
}

export function getUpdateMetadataInstructionPlanUsingInstructionData(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions'> &
    PdaDetails & {
      sizeDifference: bigint;
      extraRent: Lamports;
    }
): MessageInstructionPlan {
  const plan: InstructionPlan = {
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: 'simulated',
      }),
    ],
  };

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

export function getUpdateMetadataInstructionPlanUsingBuffer(
  input: Omit<MetadataInput, 'rpc' | 'rpcSubscriptions' | 'buffer'> &
    PdaDetails & {
      chunkSize: number;
      sizeDifference: bigint;
      extraRent: Lamports;
      bufferRent: Lamports;
      buffer: TransactionSigner;
    }
): InstructionPlan {
  const mainPlan: InstructionPlan = { kind: 'sequential', plans: [] };
  const initialMessage: InstructionPlan = {
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: 'simulated',
      }),
    ],
  };

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
  // TODO: Use parallel plan when the program supports it.
  const writePlan: InstructionPlan = { kind: 'sequential', plans: [] };
  while (offset < input.data.length) {
    writePlan.plans.push(
      getWriteInstructionPlan({
        buffer: input.buffer.address,
        authority: input.buffer,
        data: input.data.slice(offset, offset + input.chunkSize),
        priorityFees: input.priorityFees,
      })
    );
    offset += input.chunkSize;
  }
  mainPlan.plans.push(writePlan);

  const finalizeMessage: InstructionPlan = {
    kind: 'message',
    instructions: [
      ...getComputeUnitInstructions({
        computeUnitPrice: input.priorityFees,
        computeUnitLimit: 'simulated',
      }),
      getSetDataInstruction({
        ...input,
        buffer: input.buffer.address,
        programData: input.isCanonical ? input.programData : undefined,
        data: undefined,
      }),
    ],
  };

  if (input.closeBuffer) {
    // TODO: Close buffer account.
  }

  if (input.sizeDifference < 0) {
    // TODO: Trim to withdraw excess lamports.
  }

  mainPlan.plans.push(finalizeMessage);

  return mainPlan;
}
