import { address, getUtf8Encoder, none, some } from '@solana/web3.js';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  createMetadata,
  DataSource,
  Encoding,
  fetchMetadata,
  Format,
  Metadata,
} from '../src';
import {
  createDefaultSolanaClient,
  createDeployedProgram,
  generateKeyPairSignerWithSol,
} from './_setup';

test('it creates a canonical metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // When we create a canonical metadata account for the program.
  const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
  const metadata = await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data,
  });

  // Then we expect the following metadata account to be created.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.Json,
    dataSource: DataSource.Direct,
    dataLength: data.length,
    data,
  });
});

test('it creates a canonical metadata account with data larger than a transaction size', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // When we create a canonical metadata account for the program with a lot of data.
  const largeData = getUtf8Encoder().encode('x'.repeat(5_000));
  const metadata = await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: largeData,
  });

  // Then we expect the following metadata account to be created.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.Json,
    dataSource: DataSource.Direct,
    dataLength: largeData.length,
    data: largeData,
  });
});

test.skip('it creates a non-canonical metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // When we create a non-canonical metadata account for the program.
  const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
  const metadata = await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data,
  });

  // Then we expect the following metadata account to be created.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.Json,
    dataSource: DataSource.Direct,
    dataLength: data.length,
    data,
  });
});
