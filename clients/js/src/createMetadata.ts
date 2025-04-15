import { getTransferSolInstruction } from '@solana-program/system';
import {
  Address,
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
  InstructionPlan,
  isValidInstructionPlan,
  parallelInstructionPlan,
  sequentialInstructionPlan,
  TransactionPlanner,
} from './instructionPlans';
import {
  getDefaultTransactionPlannerAndExecutor,
  getPdaDetails,
  REALLOC_LIMIT,
} from './internals';
import {
  getAccountSize,
  getExtendInstructionPlan,
  getWriteInstructionPlan,
  MetadataInput,
  MetadataResponse,
} from './utils';

export async function createMetadata(
  input: MetadataInput & {
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlanExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse> {
  const { planner, executor } = getDefaultTransactionPlannerAndExecutor(input);
  const { programData, isCanonical, metadata } = await getPdaDetails(input);
  const instructionPlan = await getCreateMetadataInstructionPlan({
    ...input,
    programData: isCanonical ? programData : undefined,
    metadata,
    planner,
  });

  const transactionPlan = await planner(instructionPlan);
  const result = await executor(transactionPlan);
  return { metadata, result };
}

export async function getCreateMetadataInstructionPlan(
  input: Omit<InitializeInput, 'data'> & {
    buffer?: Address; // TODO
    data: ReadonlyUint8Array;
    payer: TransactionSigner;
    planner: TransactionPlanner;
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi>;
  }
): Promise<InstructionPlan> {
  const rent = await input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
    .send();
  const extendedInput = { ...input, rent };

  const plan =
    getCreateMetadataInstructionPlanUsingInstructionData(extendedInput);
  const validPlan = await isValidInstructionPlan(plan, input.planner);
  return validPlan
    ? plan
    : getCreateMetadataInstructionPlanUsingBuffer(extendedInput);
}

export function getCreateMetadataInstructionPlanUsingInstructionData(
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

export function getCreateMetadataInstructionPlanUsingBuffer(
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
          getExtendInstructionPlan({
            account: input.metadata,
            authority: input.authority,
            extraLength: input.data.length,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    parallelInstructionPlan([
      getWriteInstructionPlan({
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
