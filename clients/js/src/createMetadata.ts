import { getTransferSolInstruction } from '@solana-program/system';
import {
  CompilableTransactionMessage,
  GetMinimumBalanceForRentExemptionApi,
  Lamports,
  ReadonlyUint8Array,
  Rpc,
  TransactionSigner,
} from '@solana/kit';
import {
  getAllocateInstruction,
  getInitializeInstruction,
  InitializeInput,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
  getTransactionMessageFromPlan,
  InstructionPlan,
  MessageInstructionPlan,
} from './instructionPlans';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
  parallelInstructionPlan,
  sequentialInstructionPlan,
} from './instructionPlansDraft';
import {
  calculateMaxChunkSize,
  getComputeUnitInstructions,
  getExtendInstructionPlan,
  getExtendInstructionPlan__NEW,
  getPdaDetails,
  getWriteInstructionPlan,
  getWriteInstructionPlan__NEW,
  messageFitsInOneTransaction,
  PdaDetails,
  REALLOC_LIMIT,
} from './internals';
import {
  getAccountSize,
  MetadataInput,
  MetadataInput__NEW,
  MetadataResponse__NEW,
} from './utils';

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
    ],
  });

  if (input.data.length > REALLOC_LIMIT) {
    mainPlan.plans.push(
      getExtendInstructionPlan({
        account: input.metadata,
        authority: input.authority,
        extraLength: input.data.length,
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
      })
    );
  }

  let offset = 0;
  const writePlan: InstructionPlan = { kind: 'parallel', plans: [] };
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

export async function createMetadata__NEW(
  input: MetadataInput__NEW & {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlanExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse__NEW> {
  const planner = createDefaultTransactionPlanner({
    feePayer: input.payer,
    computeUnitPrice: input.priorityFees,
  });
  const executor = createDefaultTransactionPlanExecutor({
    rpc: input.rpc,
    rpcSubscriptions: input.rpcSubscriptions,
    parallelChunkSize: 5,
  });

  const [{ programData, isCanonical, metadata }, rent] = await Promise.all([
    getPdaDetails(input),
    input.rpc
      .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
      .send(),
  ]);
  const extendedInput = {
    ...input,
    programData: isCanonical ? programData : undefined,
    metadata,
    rent,
  };

  const transactionPlan = await planner(
    getCreateMetadataInstructionPlanUsingInstructionData__NEW(extendedInput)
  ).catch(() =>
    planner(getCreateMetadataInstructionPlanUsingBuffer__NEW(extendedInput))
  );

  const result = await executor(transactionPlan);
  return { metadata, result };
}

export function getCreateMetadataInstructionPlanUsingInstructionData__NEW(
  input: InitializeInput & { payer: TransactionSigner; rent: Lamports }
) {
  return sequentialInstructionPlan([
    getTransferSolInstruction({
      source: input.payer,
      destination: input.metadata,
      amount: input.rent,
    }),
    getInitializeInstruction(input),
  ]);
}

export function getCreateMetadataInstructionPlanUsingBuffer__NEW(
  input: Omit<InitializeInput, 'data'> & {
    data: ReadonlyUint8Array;
    payer: TransactionSigner;
    rent: Lamports;
  }
) {
  return sequentialInstructionPlan([
    getTransferSolInstruction({
      source: input.payer,
      destination: input.metadata,
      amount: input.rent,
    }),
    getAllocateInstruction({
      buffer: input.metadata,
      authority: input.authority,
      program: input.program,
      programData: input.programData,
      seed: input.seed,
    }),
    ...(input.data.length > REALLOC_LIMIT
      ? [
          getExtendInstructionPlan__NEW({
            account: input.metadata,
            authority: input.authority,
            extraLength: input.data.length,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    parallelInstructionPlan([
      getWriteInstructionPlan__NEW({
        buffer: input.metadata,
        authority: input.authority,
        data: input.data,
      }),
    ]),
    getInitializeInstruction({
      ...input,
      system: PROGRAM_METADATA_PROGRAM_ADDRESS,
      data: undefined,
    }),
  ]);
}
