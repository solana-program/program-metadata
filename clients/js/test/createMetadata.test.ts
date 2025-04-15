import { address, getUtf8Encoder, none, some } from '@solana/kit';
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
  createKeypairBuffer,
  generateKeyPairSignerWithSol,
} from './_setup';

test('it creates a canonical metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // When we create a canonical metadata account for the program.
  const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
  const { metadata } = await createMetadata({
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
  const largeData = getUtf8Encoder().encode('x'.repeat(3_000));
  const { metadata } = await createMetadata({
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

test('it creates a canonical metadata account using an existing buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And an existing buffer with the following data.
  const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
  const buffer = await createKeypairBuffer(client, { payer: authority, data });

  // When we create a canonical metadata account using the existing buffer.
  const { metadata } = await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    buffer: buffer.address,
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

test('it creates a non-canonical metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // When we create a non-canonical metadata account for the program.
  const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
  const { metadata } = await createMetadata({
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

test('it creates a non-canonical metadata account with data larger than a transaction size', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // When we create a non-canonical metadata account for the program with a lot of data.
  const largeData = getUtf8Encoder().encode('x'.repeat(3_000));
  const { metadata } = await createMetadata({
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
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.Json,
    dataSource: DataSource.Direct,
    dataLength: largeData.length,
    data: largeData,
  });
});

test('it creates a non-canonical metadata account using an existing buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And an existing buffer with the following data.
  const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
  const buffer = await createKeypairBuffer(client, { payer: authority, data });

  // When we create a non-canonical metadata account using the existing buffer.
  const { metadata } = await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    buffer: buffer.address,
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

test('it cannot create a metadata account if no data or buffer is provided', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // When we try to create a metadata account without providing data or buffer.
  const promise = createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
  });

  // Then we expect the following error to be thrown.
  await t.throwsAsync(promise, {
    message:
      'Either `buffer` or `data` must be provided to create a new metadata account.',
  });
});

test.todo(
  'it can close an existing buffer after using it to create a new metadata account'
);
