import { getTransferSolInstruction } from '@solana-program/system';
import {
  Account,
  GetMinimumBalanceForRentExemptionApi,
  Lamports,
  ReadonlyUint8Array,
  Rpc,
  TransactionSigner,
} from '@solana/kit';
import {
  Buffer,
  fetchBuffer,
  getAllocateInstruction,
  getInitializeInstruction,
  getWriteInstruction,
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
  const buffer = input.buffer
    ? await fetchBuffer(input.rpc, input.buffer)
    : undefined;
  const instructionPlan = await getCreateMetadataInstructionPlan({
    ...input,
    buffer,
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
    buffer?: Account<Buffer>;
    data?: ReadonlyUint8Array;
    payer: TransactionSigner;
    planner: TransactionPlanner;
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi>;
  }
): Promise<InstructionPlan> {
  if (!input.buffer && !input.data) {
    throw new Error(
      'Either `buffer` or `data` must be provided to create a new metadata account.'
    );
  }

  const data = (
    input.buffer ? input.buffer.data.data : input.data
  ) as ReadonlyUint8Array;
  const rent = await input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(data.length))
    .send();

  if (input.buffer) {
    return getCreateMetadataInstructionPlanUsingExistingBuffer({
      ...input,
      buffer: input.buffer,
      rent,
    });
  }

  const plan = getCreateMetadataInstructionPlanUsingInstructionData({
    ...input,
    rent,
    data,
  });
  const validPlan = await isValidInstructionPlan(plan, input.planner);
  return validPlan
    ? plan
    : getCreateMetadataInstructionPlanUsingNewBuffer({ ...input, rent, data });
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

export function getCreateMetadataInstructionPlanUsingNewBuffer(
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

export function getCreateMetadataInstructionPlanUsingExistingBuffer(
  input: Omit<InitializeInput, 'data'> & {
    buffer: Account<Buffer>;
    payer: TransactionSigner;
    rent: Lamports;
  }
) {
  const data = input.buffer.data.data;
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
    ...(data.length > REALLOC_LIMIT
      ? [
          getExtendInstructionPlan({
            account: input.metadata,
            authority: input.authority,
            extraLength: data.length,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    getWriteInstruction({
      buffer: input.metadata,
      authority: input.authority,
      sourceBuffer: input.buffer.address,
      offset: 0,
    }),
    getInitializeInstruction({
      ...input,
      system: PROGRAM_METADATA_PROGRAM_ADDRESS,
      data: undefined,
    }),
  ]);
}
