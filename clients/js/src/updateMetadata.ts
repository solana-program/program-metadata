import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  Account,
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
  const metadataAccount = await fetchMetadata(input.rpc, metadata);

  const instructionPlan = await getUpdateMetadataInstructionPlan({
    ...input,
    programData: isCanonical ? programData : undefined,
    metadata: metadataAccount,
    planner,
    data: input.data!, // TODO: Temporary.
  });

  const transactionPlan = await planner(instructionPlan);
  const result = await executor(transactionPlan);
  return { metadata, result };
}

export async function getUpdateMetadataInstructionPlan(
  input: Omit<SetDataInput, 'buffer' | 'data' | 'metadata'> & {
    metadata: Account<Metadata>;
    // TODO: from buffer.
    data: ReadonlyUint8Array;
    payer: TransactionSigner;
    planner: TransactionPlanner;
    rpc: Rpc<GetMinimumBalanceForRentExemptionApi>;
  }
): Promise<InstructionPlan> {
  if (!input.metadata.data.mutable) {
    throw new Error('Metadata account is immutable');
  }

  const fullRentPromise = input.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
    .send();
  const sizeDifference =
    BigInt(input.data.length) - BigInt(input.metadata.data.data.length);
  const extraRentPromise =
    sizeDifference > 0
      ? input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : Promise.resolve(lamports(0n));
  const [fullRent, extraRent, buffer] = await Promise.all([
    fullRentPromise,
    extraRentPromise,
    generateKeyPairSigner(),
  ]);

  const extendedInput = {
    ...input,
    metadata: input.metadata.address,
    buffer,
    fullRent,
    extraRent,
    sizeDifference,
  };

  const plan =
    getUpdateMetadataInstructionPlanUsingInstructionData(extendedInput);
  const validPlan = await isValidInstructionPlan(plan, input.planner);
  return validPlan
    ? plan
    : getUpdateMetadataInstructionPlanUsingBuffer(extendedInput);
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

export function getUpdateMetadataInstructionPlanUsingBuffer(
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
