import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  appendTransactionMessageInstructions,
  getUtf8Encoder,
  pipe,
} from '@solana/web3.js';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  DataSource,
  Encoding,
  fetchMetadata,
  findNonCanonicalPda,
  Format,
  getInitializeInstructionAsync,
  Metadata,
} from '../src';
import {
  createDefaultSolanaClient,
  createDefaultTransaction,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';

test('non canonical, direct, with instruction data', async (t) => {
  // Given
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');

  // And
  const [metadata] = await findNonCanonicalPda({
    authority: authority.address,
    program,
    seed,
  });
  const size = 96n + BigInt(data.length);
  const transferIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: await client.rpc.getMinimumBalanceForRentExemption(size).send(),
  });

  // When
  const createIx = await getInitializeInstructionAsync({
    authority,
    program,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: getUtf8Encoder().encode('Hello, World!'),
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([transferIx, createIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    // program: Address;
    // authority: Option<Address>;
    // mutable: boolean;
    // canonical: boolean;
    // seed: Seed;
    // encoding: Encoding;
    // compression: Compression;
    // format: Format;
    // dataSource: DataSource;
    // dataLength: number;
    // data: ReadonlyUint8Array;
  });
});
