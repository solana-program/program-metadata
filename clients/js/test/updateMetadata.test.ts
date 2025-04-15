import { address, getUtf8Encoder, none, some } from '@solana/kit';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  createMetadata,
  DataSource,
  Encoding,
  fetchMaybeBuffer,
  fetchMetadata,
  Format,
  Metadata,
  updateMetadata,
} from '../src';
import {
  createDefaultSolanaClient,
  createDeployedProgram,
  createKeypairBuffer,
  generateKeyPairSignerWithSol,
  setAuthority,
} from './_setup';

test('it updates a canonical metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And the following existing canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // When we update the metadata account with new data.
  const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    data: newData,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it updates a canonical metadata account with data larger than a transaction size', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And the following existing canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // When we update the metadata account with new data with a lot of data.
  const newData = getUtf8Encoder().encode('x'.repeat(3_000));
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    data: newData,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it updates a canonical metadata account using an existing buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And the following existing canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // And an existing buffer with the following data.
  const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
  const buffer = await createKeypairBuffer(client, {
    payer: authority,
    data: newData,
  });

  // When we update the metadata account using the existing buffer.
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    buffer: buffer.address,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it updates a non-canonical metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following existing non-canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // When we update the metadata account with new data.
  const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    data: newData,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it updates a non-canonical metadata account with data larger than a transaction size', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following existing non-canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // When we update the metadata account with new data.
  const newData = getUtf8Encoder().encode('x'.repeat(3_000));
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    data: newData,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it updates a non-canonical metadata account using an existing buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following existing non-canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // And an existing buffer with the following data.
  const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
  const buffer = await createKeypairBuffer(client, {
    payer: authority,
    data: newData,
  });

  // When we update the metadata account using the existing buffer.
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    buffer: buffer.address,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it cannot update a metadata account if no data or buffer is provided', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following existing canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // When we try to update a metadata account without providing data or buffer.
  const promise = updateMetadata({
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
      'Either `buffer` or `data` must be provided to update a metadata account.',
  });
});

test('it can close a new buffer after using it to update a new metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And the following existing canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // When we update the metadata account using the close buffer.
  const newData = getUtf8Encoder().encode('x'.repeat(3_000));
  const { metadata } = await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    data: newData,
    closeBuffer: true,
  });

  // Then we expect the metadata account to be updated.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    dataLength: newData.length,
    data: newData,
  });
});

test('it can close an existing buffer after using it to update a new metadata account', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And the following existing canonical metadata account.
  await createMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    dataSource: DataSource.Direct,
    format: Format.Json,
    data: getUtf8Encoder().encode('OLD'),
  });

  // And an existing buffer with the following data and the same authority.
  const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
  const buffer = await createKeypairBuffer(client, {
    payer: authority,
    data: newData,
  });
  await setAuthority(client, {
    payer: authority,
    account: buffer.address,
    authority: buffer,
    newAuthority: authority.address,
  });

  // When we update the metadata account using
  // the existing buffer and the `closeBuffer` option.
  await updateMetadata({
    ...client,
    payer: authority,
    authority,
    program,
    seed: 'idl',
    encoding: Encoding.Base58,
    compression: Compression.Gzip,
    dataSource: DataSource.Url,
    format: Format.Toml,
    buffer: buffer.address,
    closeBuffer: true,
  });

  // Then we expect the buffer account to no longer exist.
  const bufferAccount = await fetchMaybeBuffer(client.rpc, buffer.address);
  t.false(bufferAccount.exists);
});
