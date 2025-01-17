import {
  Address,
  appendTransactionMessageInstructions,
  Commitment,
  CompilableTransactionMessage,
  createTransactionMessage,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetMultipleAccountsApi,
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
import { getProgramDataPda, isProgramAuthority } from './utils';
import { findCanonicalPda, findNonCanonicalPda, SeedArgs } from './generated';

export type PdaDetails = {
  metadata: Address;
  isCanonical: boolean;
  programData: Address;
};

export async function getPdaDetails(input: {
  rpc: Rpc<GetMultipleAccountsApi>;
  program: Address;
  authority: TransactionSigner | Address;
  seed: SeedArgs;
}): Promise<PdaDetails> {
  const authorityAddress =
    typeof input.authority === 'string'
      ? input.authority
      : input.authority.address;
  const [programData] = await getProgramDataPda(input.program);
  const isCanonical = await isProgramAuthority(
    input.rpc,
    input.program,
    programData,
    authorityAddress
  );
  const [metadata] = isCanonical
    ? await findCanonicalPda({ program: input.program, seed: input.seed })
    : await findNonCanonicalPda({
        program: input.program,
        authority: authorityAddress,
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
