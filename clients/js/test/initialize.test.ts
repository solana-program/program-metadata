import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  getUtf8Encoder,
  none,
  pipe,
  some,
} from '@solana/web3.js';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  DataSource,
  Encoding,
  fetchMetadata,
  findCanonicalPda,
  findNonCanonicalPda,
  Format,
  getExternalDataEncoder,
  getInitializeInstruction,
  getInitializeInstructionAsync,
  Metadata,
} from '../src';
import {
  createCanonicalBuffer,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createNonCanonicalBuffer,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';

test('it initializes a non canonical PDA with direct data from instruction data', async (t) => {
  // Given the following authority and program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following metadata seed and data.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');

  // And given the metadata account is pre-funded.
  const [metadata] = await findNonCanonicalPda({
    authority: authority.address,
    program,
    seed,
  });
  const rent = await client.rpc
    .getMinimumBalanceForRentExemption(96n + BigInt(data.length))
    .send();
  const preFund = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: rent,
  });

  // When we initialize the metadata account with the data on the instruction.
  const initialize = await getInitializeInstructionAsync({
    authority,
    program,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([preFund, initialize], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the following metadata account to be created.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'dummy',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    dataLength: data.length,
    data,
  });
});

test('it initializes a non canonical PDA with url data from instruction data', async (t) => {
  // Given the following authority and program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following metadata seed and URL.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('https://example.com/my-metadata.json');

  // And given the metadata account is pre-funded.
  const [metadata] = await findNonCanonicalPda({
    authority: authority.address,
    program,
    seed,
  });
  const rent = await client.rpc
    .getMinimumBalanceForRentExemption(96n + BigInt(data.length))
    .send();
  const preFund = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: rent,
  });

  // When we initialize the metadata account with the URL on the instruction.
  const initialize = await getInitializeInstructionAsync({
    authority,
    program,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Url,
    data,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([preFund, initialize], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect a URL metadata account to be created.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'dummy',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Url,
    dataLength: data.length,
    data,
  });
});

test('it initializes a non canonical PDA with external data from instruction data', async (t) => {
  // Given the following authority and program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following metadata seed and external data.
  const seed = 'dummy';
  const data = getExternalDataEncoder().encode({
    address: address('7yokRnUjUPbpiLfyuA9NHwyQk66fYRW8mkrU5LPK3rnV'),
    offset: 32,
    length: some(96),
  });

  // And given the metadata account is pre-funded.
  const [metadata] = await findNonCanonicalPda({
    authority: authority.address,
    program,
    seed,
  });
  const rent = await client.rpc
    .getMinimumBalanceForRentExemption(96n + BigInt(data.length))
    .send();
  const preFund = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: rent,
  });

  // When we initialize the metadata account with the external data on the instruction.
  const initialize = await getInitializeInstructionAsync({
    authority,
    program,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.External,
    data,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([preFund, initialize], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect an external metadata account to be created.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'dummy',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.External,
    dataLength: data.length,
    data,
  });
});

test('it initializes a canonical PDA from instruction data', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following metadata seed and data.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');

  // And given the metadata account is pre-funded.
  const [metadata] = await findCanonicalPda({ program, seed });
  const rent = await client.rpc
    .getMinimumBalanceForRentExemption(96n + BigInt(data.length))
    .send();
  const preFund = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: rent,
  });

  // When we initialize the metadata account with the data on the instruction.
  const initialize = await getInitializeInstructionAsync({
    authority,
    program,
    programData,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([preFund, initialize], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the following metadata account to be created.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'dummy',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    dataLength: data.length,
    data,
  });
});

test('it initializes a canonical PDA from a pre-allocated buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following pre-allocated buffer account.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');
  const [metadata] = await createCanonicalBuffer(client, {
    authority,
    program,
    programData,
    seed,
    data,
  });

  // When we initialize the metadata account from the pre-allocated buffer at the same address.
  const initialize = getInitializeInstruction({
    metadata,
    authority,
    program,
    programData,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(initialize, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to now be a metadata account.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: none(),
    mutable: true,
    canonical: true,
    seed: 'dummy',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    dataLength: data.length,
    data,
  });
});

test('it initializes a non-canonical PDA from a pre-allocated buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following pre-allocated buffer account.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');
  const [metadata] = await createNonCanonicalBuffer(client, {
    authority,
    program,
    seed,
    data,
  });

  // When we initialize the metadata account from the pre-allocated buffer at the same address.
  const initialize = getInitializeInstruction({
    metadata,
    authority,
    program,
    seed,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(initialize, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to now be a metadata account.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    program,
    authority: some(authority.address),
    mutable: true,
    canonical: false,
    seed: 'dummy',
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    dataLength: data.length,
    data,
  });
});
