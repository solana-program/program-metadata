import { getCreateAccountInstruction } from '@solana-program/system';
import {
  Address,
  Commitment,
  CompilableTransactionMessage,
  TransactionMessageWithBlockhashLifetime,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionSigner,
  airdropFactory,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  appendTransactionMessageInstructions,
  getAddressEncoder,
  getProgramDerivedAddress,
  getBase64Encoder,
  KeyPairSigner,
} from '@solana/web3.js';
import { getDeployWithMaxDataLenInstruction } from './loader-v3/deploy';
import { getWriteInstruction } from './loader-v3/write';
import { getInitializeBufferInstruction } from './loader-v3/initializeBuffer';
import { LOADER_V3_PROGRAM_ADDRESS } from './loader-v3/shared';

const SMALLER_VALID_PROGRAM_BINARY =
  'f0VMRgIBAQAAAAAAAAAAAAMA9wABAAAA6AAAAAAAAABAAAAAAAAAAMgBAAAAAAAAAAAAAEAAOAADAEAABgAFAAEAAAAFAAAA6AAAAAAAAADoAAAAAAAAAOgAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAAQAAAAAAAAAQAAAAQAAABgAQAAAAAAAGABAAAAAAAAYAEAAAAAAAA8AAAAAAAAADwAAAAAAAAAABAAAAAAAAACAAAABgAAAPAAAAAAAAAA8AAAAAAAAADwAAAAAAAAAHAAAAAAAAAAcAAAAAAAAAAIAAAAAAAAAJUAAAAAAAAAHgAAAAAAAAAEAAAAAAAAAAYAAAAAAAAAYAEAAAAAAAALAAAAAAAAABgAAAAAAAAABQAAAAAAAACQAQAAAAAAAAoAAAAAAAAADAAAAAAAAAAWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQAAEA6AAAAAAAAAAAAAAAAAAAAABlbnRyeXBvaW50AAAudGV4dAAuZHluYW1pYwAuZHluc3ltAC5keW5zdHIALnNoc3RydGFiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAABgAAAAAAAADoAAAAAAAAAOgAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAHAAAABgAAAAMAAAAAAAAA8AAAAAAAAADwAAAAAAAAAHAAAAAAAAAABAAAAAAAAAAIAAAAAAAAABAAAAAAAAAAEAAAAAsAAAACAAAAAAAAAGABAAAAAAAAYAEAAAAAAAAwAAAAAAAAAAQAAAABAAAACAAAAAAAAAAYAAAAAAAAABgAAAADAAAAAgAAAAAAAACQAQAAAAAAAJABAAAAAAAADAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAgAAAAAwAAAAAAAAAAAAAAAAAAAAAAAACcAQAAAAAAACoAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAA';

type Client = {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
};

export const createDefaultSolanaClient = (): Client => {
  const rpc = createSolanaRpc('http://127.0.0.1:8899');
  const rpcSubscriptions = createSolanaRpcSubscriptions('ws://127.0.0.1:8900');
  return { rpc, rpcSubscriptions };
};

export const generateKeyPairSignerWithSol = async (
  client: Client,
  putativeLamports: bigint = 1_000_000_000n
) => {
  const signer = await generateKeyPairSigner();
  await airdropFactory(client)({
    recipientAddress: signer.address,
    lamports: lamports(putativeLamports),
    commitment: 'confirmed',
  });
  return signer;
};

export const createDefaultTransaction = async (
  client: Client,
  feePayer: TransactionSigner
) => {
  const { value: latestBlockhash } = await client.rpc
    .getLatestBlockhash()
    .send();
  return pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx)
  );
};

export const signAndSendTransaction = async (
  client: Client,
  transactionMessage: CompilableTransactionMessage &
    TransactionMessageWithBlockhashLifetime,
  commitment: Commitment = 'confirmed'
) => {
  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);
  const signature = getSignatureFromTransaction(signedTransaction);
  await sendAndConfirmTransactionFactory(client)(signedTransaction, {
    commitment,
  });
  return signature;
};

export const getBalance = async (client: Client, address: Address) =>
  (await client.rpc.getBalance(address, { commitment: 'confirmed' }).send())
    .value;

export const createDeployedProgram = async (
  client: Client,
  authority: KeyPairSigner,
  payer?: KeyPairSigner
): Promise<[Address, Address]> => {
  // Prepare all inputs.
  payer = payer ?? authority;
  const data = getBase64Encoder().encode(SMALLER_VALID_PROGRAM_BINARY);
  const dataSize = BigInt(37 + data.length);
  const programSize = 36n;
  const [buffer, program, dataRent, programRent, defaultTransaction] =
    await Promise.all([
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      client.rpc.getMinimumBalanceForRentExemption(dataSize).send(),
      client.rpc.getMinimumBalanceForRentExemption(programSize).send(),
      createDefaultTransaction(client, payer),
    ]);
  const [programData] = await getProgramDerivedAddress({
    programAddress: LOADER_V3_PROGRAM_ADDRESS,
    seeds: [getAddressEncoder().encode(program.address)],
  });

  // Create instructions.
  const createBufferIx = getCreateAccountInstruction({
    payer,
    newAccount: buffer,
    lamports: dataRent,
    space: dataSize,
    programAddress: LOADER_V3_PROGRAM_ADDRESS,
  });
  const initializeBufferIx = getInitializeBufferInstruction({
    sourceAccount: buffer.address,
    bufferAuthority: authority.address,
  });
  const writeIx = getWriteInstruction({
    bufferAccount: buffer.address,
    bufferAuthority: authority,
    offset: 0,
    bytes: data,
  });
  const createProgramIx = getCreateAccountInstruction({
    payer,
    newAccount: program,
    lamports: programRent,
    space: programSize,
    programAddress: LOADER_V3_PROGRAM_ADDRESS,
  });
  const deployIx = getDeployWithMaxDataLenInstruction({
    payerAccount: payer,
    programDataAccount: programData,
    programAccount: program.address,
    bufferAccount: buffer.address,
    authority,
    maxDataLen: data.length,
  });

  // Send instructions.
  await pipe(
    defaultTransaction,
    (tx) =>
      appendTransactionMessageInstructions(
        [createBufferIx, initializeBufferIx, writeIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );
  await pipe(
    defaultTransaction,
    (tx) =>
      appendTransactionMessageInstructions([createProgramIx, deployIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  return [program.address, programData];
};
