import {
  Address,
  appendTransactionMessageInstructions,
  Commitment,
  CompilableTransactionMessage,
  createTransactionMessage,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetSignatureStatusesApi,
  IInstruction,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  SendTransactionApi,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  SignatureNotificationsApi,
  signTransactionMessageWithSigners,
  SlotNotificationsApi,
  TransactionMessageWithBlockhashLifetime,
  TransactionSigner,
} from '@solana/web3.js';
import { findMetadataPda, SeedArgs } from './generated';
import { getProgramAuthority } from './utils';

export type PdaDetails = {
  metadata: Address;
  isCanonical: boolean;
  programData?: Address;
};

export async function getPdaDetails(input: {
  rpc: Rpc<GetAccountInfoApi>;
  program: Address;
  authority: TransactionSigner | Address;
  seed: SeedArgs;
}): Promise<PdaDetails> {
  const authorityAddress =
    typeof input.authority === 'string'
      ? input.authority
      : input.authority.address;
  const { authority, programData } = await getProgramAuthority(
    input.rpc,
    input.program
  );
  const isCanonical = !!authority && authority === authorityAddress;
  const [metadata] = await findMetadataPda({
    program: input.program,
    authority: isCanonical ? null : authorityAddress,
    seed: input.seed,
  });
  return { metadata, isCanonical, programData };
}

export async function sendInstructionsInSequentialTransactions(input: {
  rpc: Rpc<
    GetLatestBlockhashApi &
      GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi
  >;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
  payer: TransactionSigner;
  instructions: IInstruction[][];
}) {
  const sendAndConfirm = sendAndConfirmTransactionFactory(input);
  for (const instructions of input.instructions) {
    await pipe(
      await getBaseTransactionMessage(input.rpc, input.payer),
      (tx) => appendTransactionMessageInstructions(instructions, tx),
      (tx) => signAndSendTransaction(tx, sendAndConfirm)
    );
  }
}

async function getBaseTransactionMessage(
  rpc: Rpc<GetLatestBlockhashApi>,
  payer: TransactionSigner
) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  return pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx)
  );
}

async function signAndSendTransaction(
  transactionMessage: CompilableTransactionMessage &
    TransactionMessageWithBlockhashLifetime,
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>,
  commitment: Commitment = 'confirmed'
) {
  const tx = await signTransactionMessageWithSigners(transactionMessage);
  await sendAndConfirm(tx, { commitment });
}

export type InstructionPlan =
  | { kind: 'sequential'; plans: InstructionPlan[] }
  | { kind: 'parallel'; plans: InstructionPlan[] }
  | { kind: 'message'; instructions: IInstruction[] };

export async function sendInstructionPlan(
  plan: InstructionPlan,
  createMessage: () => Promise<
    CompilableTransactionMessage & TransactionMessageWithBlockhashLifetime
  >,
  sendAndConfirm: ReturnType<typeof sendAndConfirmTransactionFactory>
) {
  switch (plan.kind) {
    case 'sequential':
      return await sendSequentialInstructionPlan(
        plan,
        createMessage,
        sendAndConfirm
      );
    case 'parallel':
      return await sendParallelInstructionPlan(
        plan,
        createMessage,
        sendAndConfirm
      );
    case 'message':
      return await sendMessageInstructionPlan(
        plan,
        createMessage,
        sendAndConfirm
      );
    default:
      throw new Error('Unsupported instruction plan');
  }
}

async function sendSequentialInstructionPlan(
  plan: InstructionPlan & { kind: 'sequential' },
  createMessage: Parameters<typeof sendInstructionPlan>[1],
  sendAndConfirm: Parameters<typeof sendInstructionPlan>[2]
) {
  for (const subPlan of plan.plans) {
    await sendInstructionPlan(subPlan, createMessage, sendAndConfirm);
  }
}

async function sendParallelInstructionPlan(
  plan: InstructionPlan & { kind: 'parallel' },
  createMessage: Parameters<typeof sendInstructionPlan>[1],
  sendAndConfirm: Parameters<typeof sendInstructionPlan>[2]
) {
  await Promise.all(
    plan.plans.map((subPlan) =>
      sendInstructionPlan(subPlan, createMessage, sendAndConfirm)
    )
  );
}

async function sendMessageInstructionPlan(
  plan: InstructionPlan & { kind: 'message' },
  createMessage: Parameters<typeof sendInstructionPlan>[1],
  sendAndConfirm: Parameters<typeof sendInstructionPlan>[2]
) {
  await pipe(
    await createMessage(),
    (tx) => appendTransactionMessageInstructions(plan.instructions, tx),
    (tx) => signAndSendTransaction(tx, sendAndConfirm)
  );
}
