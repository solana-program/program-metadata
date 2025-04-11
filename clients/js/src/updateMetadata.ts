import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
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
  PROGRAM_METADATA_PROGRAM_ADDRESS,
  SetDataInput,
} from './generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
  parallelInstructionPlan,
  sequentialInstructionPlan,
} from './instructionPlans';
import {
  getExtendInstructionPlan,
  getPdaDetails,
  getWriteInstructionPlan,
  REALLOC_LIMIT,
} from './internals';
import { getAccountSize, MetadataInput, MetadataResponse } from './utils';

export async function updateMetadata(
  input: MetadataInput & {
    rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi> &
      Parameters<typeof createDefaultTransactionPlanExecutor>[0]['rpc'];
    rpcSubscriptions: Parameters<
      typeof createDefaultTransactionPlanExecutor
    >[0]['rpcSubscriptions'];
  }
): Promise<MetadataResponse> {
  const planner = createDefaultTransactionPlanner({
    feePayer: input.payer,
    computeUnitPrice: input.priorityFees,
  });
  const executor = createDefaultTransactionPlanExecutor({
    rpc: input.rpc,
    rpcSubscriptions: input.rpcSubscriptions,
    parallelChunkSize: 5,
  });

  const [{ programData, isCanonical, metadata }, bufferRent] =
    await Promise.all([
      getPdaDetails(input),
      input.rpc
        .getMinimumBalanceForRentExemption(getAccountSize(input.data.length))
        .send(),
    ]);

  const metadataAccount = await fetchMetadata(input.rpc, metadata);
  if (!metadataAccount.data.mutable) {
    throw new Error('Metadata account is immutable');
  }

  const sizeDifference =
    BigInt(input.data.length) - BigInt(metadataAccount.data.data.length);
  const extraRentPromise =
    sizeDifference > 0
      ? input.rpc.getMinimumBalanceForRentExemption(sizeDifference).send()
      : Promise.resolve(lamports(0n));
  const [extraRent, buffer] = await Promise.all([
    extraRentPromise,
    generateKeyPairSigner(),
  ]);

  const extendedInput = {
    ...input,
    programData: isCanonical ? programData : undefined,
    metadata,
    buffer,
    bufferRent,
    extraRent,
    sizeDifference,
  };

  const transactionPlan = await planner(
    getUpdateMetadataInstructionPlanUsingInstructionData(extendedInput)
  ).catch(() =>
    planner(getUpdateMetadataInstructionPlanUsingBuffer(extendedInput))
  );

  const result = await executor(transactionPlan);
  return { metadata, result };
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
    bufferRent: Lamports;
    closeBuffer?: boolean;
    data: ReadonlyUint8Array;
    extraRent: Lamports;
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
      lamports: input.bufferRent,
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
