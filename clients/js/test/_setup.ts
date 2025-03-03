import {
  getCreateAccountInstruction,
  getTransferSolInstruction,
} from '@solana-program/system';
import {
  Address,
  airdropFactory,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  BASE_ACCOUNT_SIZE,
  Commitment,
  CompilableTransactionMessage,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Encoder,
  getSignatureFromTransaction,
  IInstruction,
  isOption,
  KeyPairSigner,
  lamports,
  pipe,
  ReadonlyUint8Array,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransactionMessageWithSigners,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionMessageWithBlockhashLifetime,
  TransactionSigner,
  unwrapOption,
} from '@solana/kit';
import {
  Compression,
  DataSource,
  Encoding,
  findCanonicalPda,
  findNonCanonicalPda,
  Format,
  getAllocateInstruction,
  getExtendInstruction,
  getInitializeInstruction,
  getProgramDataPda as getLoaderV3ProgramDataPda,
  getWriteInstruction,
  InitializeInput,
  LOADER_V3_PROGRAM_ADDRESS,
  SeedArgs,
} from '../src';
import { getDeployWithMaxDataLenInstruction as getLoaderV3DeployInstruction } from './loader-v3/deploy';
import { getInitializeBufferInstruction as getLoaderV3InitializeBufferInstruction } from './loader-v3/initializeBuffer';
import { getWriteInstruction as getLoaderV3WriteInstruction } from './loader-v3/write';

export const REALLOC_LIMIT = 10_240;
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

export const getRentWithoutHeader = async (
  client: Client,
  bytes: bigint | number
) => {
  const rentForHeader = await client.rpc
    .getMinimumBalanceForRentExemption(0n)
    .send();
  return lamports((rentForHeader * BigInt(bytes)) / BigInt(BASE_ACCOUNT_SIZE));
};

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
  const [programData] = await getLoaderV3ProgramDataPda(program.address);

  // Create instructions.
  const createBufferIx = getCreateAccountInstruction({
    payer,
    newAccount: buffer,
    lamports: dataRent,
    space: dataSize,
    programAddress: LOADER_V3_PROGRAM_ADDRESS,
  });
  const initializeBufferIx = getLoaderV3InitializeBufferInstruction({
    sourceAccount: buffer.address,
    bufferAuthority: authority.address,
  });
  const writeIx = getLoaderV3WriteInstruction({
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
  const deployIx = getLoaderV3DeployInstruction({
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

export async function createBuffer(
  client: Client,
  input: {
    buffer: Address;
    authority: TransactionSigner;
    payer?: TransactionSigner;
    program?: Address;
    programData?: Address;
    seed?: SeedArgs;
    dataLength?: number;
    data?: ReadonlyUint8Array;
  }
): Promise<void> {
  const { buffer, authority, program, programData, seed, data } = input;
  const payer = input.payer ?? authority;
  const dataLenth = input.dataLength ?? input.data?.length ?? 0;
  const bufferSize = 96 + dataLenth;
  const [rent, defaultTransaction] = await Promise.all([
    client.rpc.getMinimumBalanceForRentExemption(BigInt(bufferSize)).send(),
    createDefaultTransaction(client, payer),
  ]);
  const preFundIx = getTransferSolInstruction({
    source: payer,
    destination: buffer,
    amount: rent,
  });
  const allocateIx = getAllocateInstruction({
    buffer,
    authority,
    program,
    programData,
    seed,
  });
  const instructions: IInstruction[] = [preFundIx, allocateIx];
  if (dataLenth >= REALLOC_LIMIT) {
    let offset = 0;
    while (offset < dataLenth) {
      const length = Math.min(dataLenth - offset, REALLOC_LIMIT);
      instructions.push(
        getExtendInstruction({ account: buffer, authority, length })
      );
      offset += length;
    }
  }
  await pipe(
    defaultTransaction,
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => signAndSendTransaction(client, tx)
  );
  if (data) {
    let offset = 0;
    const chunkSize = 900;
    const writePromises: Promise<Signature>[] = [];
    while (offset < data.length) {
      const writeIx = getWriteInstruction({
        buffer,
        authority,
        offset,
        data: data.slice(offset, offset + chunkSize),
      });
      writePromises.push(
        pipe(
          defaultTransaction,
          (tx) => appendTransactionMessageInstruction(writeIx, tx),
          (tx) => signAndSendTransaction(client, tx)
        )
      );
      offset += chunkSize;
    }
    await Promise.all(writePromises);
  }
}

export async function createCanonicalBuffer(
  client: Client,
  input: {
    authority: TransactionSigner;
    payer?: TransactionSigner;
    program: Address;
    programData: Address;
    seed: SeedArgs;
    dataLength?: number;
    data?: ReadonlyUint8Array;
  }
) {
  const buffer = await findCanonicalPda({
    program: input.program,
    seed: input.seed,
  });
  await createBuffer(client, { buffer: buffer[0], ...input });
  return buffer;
}

export async function createNonCanonicalBuffer(
  client: Client,
  input: {
    authority: TransactionSigner;
    payer?: TransactionSigner;
    program: Address;
    seed: SeedArgs;
    dataLength?: number;
    data?: ReadonlyUint8Array;
  }
) {
  const buffer = await findNonCanonicalPda({
    program: input.program,
    authority: input.authority.address,
    seed: input.seed,
  });
  await createBuffer(client, { buffer: buffer[0], ...input });
  return buffer;
}

export async function createKeypairBuffer(
  client: Client,
  input: {
    payer: TransactionSigner;
    dataLength?: number;
    data?: ReadonlyUint8Array;
  }
) {
  const buffer = await generateKeyPairSigner();
  await createBuffer(client, {
    buffer: buffer.address,
    authority: buffer,
    ...input,
  });
  return buffer;
}

type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;
export async function createMetadata(
  client: Client,
  input: PartialExcept<
    InitializeInput,
    'metadata' | 'authority' | 'seed' | 'program'
  > & {
    payer?: TransactionSigner;
  }
): Promise<void> {
  const { payer = input.authority, ...initializeInput } = input;
  const data =
    (isOption(input.data) ? unwrapOption(input.data) : input.data) ??
    new Uint8Array([]);
  const dataSize = BigInt(96 + data.length);
  const [rent, defaultTransaction] = await Promise.all([
    client.rpc.getMinimumBalanceForRentExemption(dataSize).send(),
    createDefaultTransaction(client, payer),
  ]);
  const preFundIx = getTransferSolInstruction({
    source: payer,
    destination: input.metadata,
    amount: rent,
  });
  const initializeIx = getInitializeInstruction({
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    ...initializeInput,
  });
  await pipe(
    defaultTransaction,
    (tx) => appendTransactionMessageInstructions([preFundIx, initializeIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );
}

export async function createCanonicalMetadata(
  client: Client,
  input: Omit<Parameters<typeof createMetadata>[1], 'metadata'>
) {
  const metadata = await findCanonicalPda({
    program: input.program,
    seed: input.seed,
  });
  await createMetadata(client, { metadata: metadata[0], ...input });
  return metadata;
}

export async function createNonCanonicalMetadata(
  client: Client,
  input: Omit<Parameters<typeof createMetadata>[1], 'metadata'>
) {
  const metadata = await findNonCanonicalPda({
    program: input.program,
    authority: input.authority.address,
    seed: input.seed,
  });
  await createMetadata(client, { metadata: metadata[0], ...input });
  return metadata;
}
