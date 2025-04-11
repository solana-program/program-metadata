import { fetchEncodedAccount, getUtf8Encoder, none } from '@solana/kit';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  createMetadata,
  DataSource,
  Encoding,
  fetchMetadata,
  findCanonicalPda,
  Format,
  Metadata,
  uploadMetadata,
} from '../src';
import {
  createDefaultSolanaClient,
  createDeployedProgram,
  generateKeyPairSignerWithSol,
} from './_setup';

test('it creates a new metadata account if it does not exist', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And given the following canonical metadata account does not exist.
  const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
  t.false((await fetchEncodedAccount(client.rpc, metadata)).exists);

  // When we upload this canonical metadata account.
  const data = getUtf8Encoder().encode('Some data');
  await uploadMetadata({
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

  // Then we expect the metadata account to be created.
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
    dataSource: DataSource.Direct,
    format: Format.Json,
    dataLength: data.length,
    data: data,
  });
});

test('it updates a metadata account if it exists', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And given the following canonical metadata account exists.
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

  // When we upload this canonical metadata account with different data.
  const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
  const { metadata } = await uploadMetadata({
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
