import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  CompilableTransactionMessage,
  generateKeyPairSigner,
  GetAccountInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  isTransactionSigner,
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
  getExtendedMetadataInput,
  getExtendInstructionPlan,
  getExtendInstructionPlan__NEW,
  getMetadataInstructionPlanExecutor,
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
  MetadataResponse,
  MetadataResponse__NEW,
} from './utils';

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

  plan.instructions.push(
    getSetDataInstruction({
      ...input,
      programData: input.isCanonical ? input.programData : undefined,
      buffer: undefined,
    })
  );

  if (input.sizeDifference < 0) {
    plan.instructions.push(
      getTrimInstruction({
        account: input.metadata,
        authority: input.authority,
        destination: input.payer.address,
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
      })
    );
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

  initialMessage.instructions.push(
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
    })
  );
  mainPlan.plans.push(initialMessage);

  if (input.sizeDifference > REALLOC_LIMIT) {
    mainPlan.plans.push(
      getExtendInstructionPlan({
        account: input.metadata,
        authority: input.authority,
        extraLength: Number(input.sizeDifference),
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
        priorityFees: input.priorityFees,
      })
    );
  }

  let offset = 0;
  const writePlan: InstructionPlan = { kind: 'parallel', plans: [] };
  while (offset < input.data.length) {
    writePlan.plans.push(
      getWriteInstructionPlan({
        buffer: input.buffer.address,
        authority: input.authority,
        offset,
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
    finalizeMessage.instructions.push(
      getCloseInstruction({
        account: input.buffer.address,
        authority: input.authority,
        destination: input.payer.address,
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
      })
    );
  }

  if (input.sizeDifference < 0) {
    finalizeMessage.instructions.push(
      getTrimInstruction({
        account: input.metadata,
        authority: input.authority,
        destination: input.payer.address,
        program: input.program,
        programData: input.isCanonical ? input.programData : undefined,
      })
    );
  }

  mainPlan.plans.push(finalizeMessage);

  return mainPlan;
}

export async function updateMetadata__NEW(
  input: MetadataInput__NEW & {
    rpc: Rpc<GetAccountInfoApi & GetMinimumBalanceForRentExemptionApi> &
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

  const sizeDifference = BigInt(input.data.length) - metadataAccount.space;
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
    getUpdateMetadataInstructionPlanUsingInstructionData__NEW(extendedInput)
  ).catch(() =>
    planner(getUpdateMetadataInstructionPlanUsingBuffer__NEW(extendedInput))
  );

  const result = await executor(transactionPlan);

  return { metadata, result };
}

export function getUpdateMetadataInstructionPlanUsingInstructionData__NEW(
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

export function getUpdateMetadataInstructionPlanUsingBuffer__NEW(
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
          getExtendInstructionPlan__NEW({
            account: input.metadata,
            authority: input.authority,
            extraLength: Number(input.sizeDifference),
            program: input.program,
            programData: input.programData,
          }),
        ]
      : []),
    parallelInstructionPlan([
      getWriteInstructionPlan__NEW({
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
