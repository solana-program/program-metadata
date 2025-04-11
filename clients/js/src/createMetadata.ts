import { getTransferSolInstruction } from '@solana-program/system';
import {
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
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
  parallelInstructionPlan,
  sequentialInstructionPlan,
} from './instructionPlansDraft';
import {
  getExtendInstructionPlan__NEW,
  getPdaDetails,
  getWriteInstructionPlan__NEW,
  REALLOC_LIMIT,
} from './internals';
import {
  getAccountSize,
  MetadataInput__NEW,
  MetadataResponse__NEW,
} from './utils';

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
