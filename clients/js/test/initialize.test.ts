import {
  address,
  appendTransactionMessageInstruction,
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

  // When
  const createIx = await getInitializeInstructionAsync({
    authority,
    program,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: null,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(createIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then
  const [pda] = await findNonCanonicalPda({
    authority: authority.address,
    program,
    seed,
  });
  const metadata = await fetchMetadata(client.rpc, pda);
  t.like(metadata, <Metadata>{
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
