import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  Account,
  Address,
  generateKeyPairSigner,
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  lamports,
  Lamports,
  ReadonlyUint8Array,
  Rpc,
  TransactionSigner,
} from '@solana/kit';
import {
  Buffer,
  fetchBuffer,
  fetchMetadata,
  getAllocateInstruction,
  getCloseInstruction,
  getSetAuthorityInstruction,
  getSetDataInstruction,
  getTrimInstruction,
  Metadata,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
  SetDataInput,
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

export async function updateMetadata(
  input: MetadataInput & {
    rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlanExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse> {
  const { planner, executor } = getDefaultTransactionPlannerAndExecutor(input);
  const { programData, isCanonical, metadata } = await getPdaDetails(input);
  const [metadataAccount, buffer] = await Promise.all([
    fetchMetadata(input.rpc, metadata),
    input.buffer
      ? fetchBuffer(input.rpc, input.buffer)
      : Promise.resolve(undefined),
  ]);

  const instructionPlan = await getUpdateMetadataInstructionPlan({
    ...input,
    buffer,
    metadata: metadataAccount,
    planner,
    programData: isCanonical ? programData : undefined,
  });

  const transactionPlan = await planner(instructionPlan);
  const result = await executor(transactionPlan);
  return { metadata, result };
}

export async function getUpdateMetadataInstructionPlan(
  input: Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
    metadata: Account<Metadata>;
    buffer?: Account<Buffer>;
    data?: ReadonlyUint8Array;
    payer: TransactionSigner;
    planner: TransactionPlanner;
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi>;
  }
): Promise<InstructionPlan> {
  if (!input.buffer && !input.data) {
    throw new Error(
      'Either `buffer` or `data` must be provided to update a metadata account.'
    );
  }
  if (!input.metadata.data.mutable) {
    throw new Error('Metadata account is immutable');
  }

  const data = (
    input.buffer ? input.buffer.data.data : input.data
  ) as ReadonlyUint8Array;
  const fullRentPromise = input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(data.length))
    .send();
  const sizeDifference =
    BigInt(data.length) - BigInt(input.metadata.data.data.length);
  const extraRentPromise =
    sizeDifference > 0
      ? input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : Promise.resolve(lamports(0n));
  const [fullRent, extraRent, buffer] = await Promise.all([
    fullRentPromise,
    extraRentPromise,
    generateKeyPairSigner(),
  ]);

  if (input.buffer) {
    return getUpdateMetadataInstructionPlanUsingExistingBuffer({
      ...input,
      buffer: input.buffer.address,
      extraRent,
      metadata: input.metadata.address,
      fullRent,
      sizeDifference,
    });
  }

  const extendedInput = {
    ...input,
    buffer,
    data,
    extraRent,
    fullRent,
    metadata: input.metadata.address,
    sizeDifference,
  };

  const plan =
    getUpdateMetadataInstructionPlanUsingInstructionData(extendedInput);
  const validPlan = await isValidInstructionPlan(plan, input.planner);
  return validPlan
    ? plan
    : getUpdateMetadataInstructionPlanUsingNewBuffer(extendedInput);
}

export function getUpdateMetadataInstructionPlanUsingInstructionData(
  input: Omit<SetDataInput, 'buffer'> & {
    extraRent: Lamports;
    payer: TransactionSigner;
    sizeDifference: bigint | number;
  }
) {
  return sequentialInstructionPlan([
    ...(input.sizeDifference > 0
      ? [
          getTransferSolInstruction({
            source: input.payer,
            destination: input.metadata,
            amount: input.extraRent,
          }),
        ]
      : []),
    getSetDataInstruction({ ...input, buffer: undefined }),
    ...(input.sizeDifference < 0
      ? [
          getTrimInstruction({
            account: input.metadata,
            authority: input.authority,
            destination: input.payer.address,
            program: input.program,
            programData: input.program,
          }),
        ]
      : []),
  ]);
}

export function getUpdateMetadataInstructionPlanUsingNewBuffer(
  input: Omit<SetDataInput, 'buffer' | 'data'> & {
    buffer: TransactionSigner;
    closeBuffer?: boolean;
    data: ReadonlyUint8Array;
    extraRent: Lamports;
    fullRent: Lamports;
    payer: TransactionSigner;
    sizeDifference: number | bigint;
  }
) {
  return sequentialInstructionPlan([
    ...(input.sizeDifference > 0
      ? [
          getTransferSolInstruction({
            source: input.payer,
            destination: input.metadata,
            amount: input.extraRent,
          }),
        ]
      : []),
    getCreateAccountInstruction({
      payer: input.payer,
      newAccount: input.buffer,
      lamports: input.fullRent,
      space: getAccountSize(input.data.length),
      programAddress: PROGRAM_METADATA_PROGRAM_ADDRESS,
    }),
    getAllocateInstruction({
      buffer: input.buffer.address,
      authority: input.buffer,
    }),
    getSetAuthorityInstruction({
      account: input.buffer.address,
      authority: input.buffer,
      newAuthority: input.authority.address,
    }),
    ...(input.sizeDifference > REALLOC_LIMIT
      ? [
          getExtendInstructionPlan({
            account: input.metadata,
            authority: input.authority,
            extraLength: Number(input.sizeDifference),
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    parallelInstructionPlan([
      getWriteInstructionPlan({
        buffer: input.buffer.address,
        authority: input.authority,
        data: input.data,
      }),
    ]),
    getSetDataInstruction({
      ...input,
      buffer: input.buffer.address,
      data: undefined,
    }),
    ...(input.closeBuffer
      ? [
          getCloseInstruction({
            account: input.buffer.address,
            authority: input.authority,
            destination: input.payer.address,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    ...(input.sizeDifference < 0
      ? [
          getTrimInstruction({
            account: input.metadata,
            authority: input.authority,
            destination: input.payer.address,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
  ]);
}

export function getUpdateMetadataInstructionPlanUsingExistingBuffer(
  input: Omit<SetDataInput, 'buffer' | 'data'> & {
    buffer: Address;
    closeBuffer?: boolean;
    extraRent: Lamports;
    fullRent: Lamports;
    payer: TransactionSigner;
    sizeDifference: number | bigint;
  }
) {
  return sequentialInstructionPlan([
    ...(input.sizeDifference > 0
      ? [
          getTransferSolInstruction({
            source: input.payer,
            destination: input.metadata,
            amount: input.extraRent,
          }),
        ]
      : []),
    ...(input.sizeDifference > REALLOC_LIMIT
      ? [
          getExtendInstructionPlan({
            account: input.metadata,
            authority: input.authority,
            extraLength: Number(input.sizeDifference),
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    getSetDataInstruction({
      ...input,
      buffer: input.buffer,
      data: undefined,
    }),
    ...(input.closeBuffer
      ? [
          getCloseInstruction({
            account: input.buffer,
            authority: input.authority,
            destination: input.payer.address,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    ...(input.sizeDifference < 0
      ? [
          getTrimInstruction({
            account: input.metadata,
            authority: input.authority,
            destination: input.payer.address,
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
  ]);
}
