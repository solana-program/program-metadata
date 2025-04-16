import { getTransferSolInstruction } from '@solana-program/system';
import {
  Account,
  Address,
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
  getCloseInstruction,
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
  const [{ programData, isCanonical, metadata }, buffer] = await Promise.all([
    getPdaDetails(input),
    input.buffer
      ? fetchBuffer(input.rpc, input.buffer)
      : Promise.resolve(undefined),
  ]);
  const instructionPlan = await getCreateMetadataInstructionPlan({
    ...input,
    buffer,
    metadata,
    planner,
    programData: isCanonical ? programData : undefined,
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
    closeBuffer?: Address | boolean;
  }
): Promise<InstructionPlan> {
  if (!input.buffer && !input.data) {
    throw new Error(
      'Either `buffer` or `data` must be provided to create a new metadata account.'
    );
  }

  const data = (input.buffer?.data.data ?? input.data) as ReadonlyUint8Array;
  const rent = await input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(data.length))
    .send();

  if (input.buffer) {
    return getCreateMetadataInstructionPlanUsingExistingBuffer({
      ...input,
      buffer: input.buffer.address,
      dataLength: data.length,
      rent,
    });
  }

  const extendedInput = { ...input, rent, data };
  const plan =
    getCreateMetadataInstructionPlanUsingInstructionData(extendedInput);
  const validPlan = await isValidInstructionPlan(plan, input.planner);
  return validPlan
    ? plan
    : getCreateMetadataInstructionPlanUsingNewBuffer(extendedInput);
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
    buffer: Address;
    dataLength: number;
    payer: TransactionSigner;
    rent: Lamports;
    closeBuffer?: Address | boolean;
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
    ...(input.dataLength > REALLOC_LIMIT
      ? [
          getExtendInstructionPlan({
            account: input.metadata,
            authority: input.authority,
            extraLength: input.dataLength,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    getWriteInstruction({
      buffer: input.metadata,
      authority: input.authority,
      sourceBuffer: input.buffer,
      offset: 0,
    }),
    getInitializeInstruction({
      ...input,
      system: PROGRAM_METADATA_PROGRAM_ADDRESS,
      data: undefined,
    }),
    ...(input.closeBuffer
      ? [
          getCloseInstruction({
            account: input.buffer,
            authority: input.authority,
            destination:
              typeof input.closeBuffer === 'string'
                ? input.closeBuffer
                : input.payer.address,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
  ]);
}
