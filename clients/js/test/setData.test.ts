import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  appendTransactionMessageInstructions,
  generateKeyPairSigner,
  getUtf8Encoder,
  isSolanaError,
  pipe,
  SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA,
} from '@solana/web3.js';
import test from 'ava';
import {
  Compression,
  DataSource,
  Encoding,
  fetchMetadata,
  Format,
  getSetAuthorityInstruction,
  getSetDataInstruction,
  getSetImmutableInstruction,
  Metadata,
} from '../src';
import {
  createCanonicalMetadata,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createKeypairBuffer,
  createNonCanonicalMetadata,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';

test('the program authority of a canonical metadata account can update its data using instruction data', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const originalData = getUtf8Encoder().encode('Original data');
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: originalData,
  });

  // And given we fund the metadata account for the extra space needed for the new data.
  const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
  const extraSpace = BigInt(newData.length - originalData.length);
  const extraRent = await client.rpc
    .getMinimumBalanceForRentExemption(extraSpace)
    .send();
  const transferIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });

  // When the program authority updates the data of the metadata account using instruction data.
  const setDataIx = getSetDataInstruction({
    metadata,
    authority,
    program,
    programData,
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([transferIx, setDataIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account have the new data.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
});

test('the explicit authority of a canonical metadata account can update its data using instruction data', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, explicitAuthority] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const originalData = getUtf8Encoder().encode('Original data');
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: originalData,
  });

  // And given an explicit authority is set on the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthority.address,
  });

  // And given we fund the metadata account for the extra space needed for the new data.
  const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
  const extraSpace = BigInt(newData.length - originalData.length);
  const extraRent = await client.rpc
    .getMinimumBalanceForRentExemption(extraSpace)
    .send();
  const transferIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });

  // When the explicit authority updates the data of the metadata account using instruction data.
  const setDataIx = getSetDataInstruction({
    metadata,
    authority: explicitAuthority,
    program,
    programData,
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [setAuthorityIx, transferIx, setDataIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account have the new data.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
});

test('the authority of a non-canonical metadata account can update its data using instruction data', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following initialized non-canonical metadata account.
  const originalData = getUtf8Encoder().encode('Original data');
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    program,
    seed: 'dummy',
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: originalData,
  });

  // And given we fund the metadata account for the extra space needed for the new data.
  const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
  const extraSpace = BigInt(newData.length - originalData.length);
  const extraRent = await client.rpc
    .getMinimumBalanceForRentExemption(extraSpace)
    .send();
  const transferIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });

  // When the metadata authority updates the account data using instruction data.
  const setDataIx = getSetDataInstruction({
    metadata,
    authority,
    program,
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([transferIx, setDataIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account have the new data.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
});

test('the program authority of a canonical metadata account can update its data using a pre-allocated buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const originalData = getUtf8Encoder().encode('Original data');
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: originalData,
  });

  // And the following pre-allocated buffer account with written data.
  const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
  const buffer = await createKeypairBuffer(client, {
    payer: authority,
    data: newData,
  });

  // When the program authority updates the data of the metadata account using the buffer.
  const extraSize = BigInt(newData.length - originalData.length);
  const extraRent = await client.rpc
    .getMinimumBalanceForRentExemption(extraSize)
    .send();
  const fundMetadataIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });
  const setDataIx = getSetDataInstruction({
    metadata,
    authority,
    buffer: buffer.address,
    program,
    programData,
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions([setDataIx, fundMetadataIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account have the new data.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
});

test('the explicit authority of a canonical metadata account can update its data using a pre-allocated buffer', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, explicitAuthority] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const originalData = getUtf8Encoder().encode('Original data');
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: originalData,
  });

  // And the following pre-allocated buffer account with written data.
  const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
  const buffer = await createKeypairBuffer(client, {
    payer: authority,
    data: newData,
  });

  // And given an explicit authority is set on the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthority.address,
  });

  // When the explicit authority updates the data of the metadata account using the buffer.
  const extraSize = BigInt(newData.length - originalData.length);
  const extraRent = await client.rpc
    .getMinimumBalanceForRentExemption(extraSize)
    .send();
  const fundMetadataIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });
  const setDataIx = getSetDataInstruction({
    metadata,
    authority: explicitAuthority,
    buffer: buffer.address,
    program,
    programData,
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [setAuthorityIx, fundMetadataIx, setDataIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account have the new data.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
});

test('the authority of a non-canonical metadata account can update its data using a pre-allocated buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following initialized non-canonical metadata account.
  const originalData = getUtf8Encoder().encode('Original data');
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    program,
    seed: 'dummy',
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: originalData,
  });

  // And the following pre-allocated buffer account with written data.
  const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
  const buffer = await createKeypairBuffer(client, {
    payer: authority,
    data: newData,
  });

  // When the metadata authority updates the account using the pre-allocated buffer.
  const extraSize = BigInt(newData.length - originalData.length);
  const extraRent = await client.rpc
    .getMinimumBalanceForRentExemption(extraSize)
    .send();
  const fundMetadataIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });
  const setDataIx = getSetDataInstruction({
    metadata,
    authority,
    buffer: buffer.address,
    program,
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions([fundMetadataIx, setDataIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account have the new data.
  const account = await fetchMetadata(client.rpc, metadata);
  t.like(account.data, <Metadata>{
    encoding: Encoding.Utf8,
    compression: Compression.Gzip,
    format: Format.Json,
    dataSource: DataSource.Url,
    data: newData,
  });
});

test('an immutable canonical metadata account cannot be updated', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Original data'),
  });

  // And given the metadata account is immutable.
  const setImmutableIx = getSetImmutableInstruction({
    metadata,
    authority,
    program,
    programData,
  });

  // When the program authority tries to update the data of the metadata account.
  const setDataIx = getSetDataInstruction({
    metadata,
    authority,
    program,
    programData,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.Json,
    dataSource: DataSource.Direct,
    data: getUtf8Encoder().encode('New data'),
  });
  const promise = pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions([setImmutableIx, setDataIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the transaction to fail.
  const error = await t.throwsAsync(promise);
  t.true(
    isSolanaError(
      error.cause,
      SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA
    )
  );
});

test('an immutable non-canonical metadata account cannot be updated', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following initialized non-canonical metadata account.
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    program,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Original data'),
  });

  // And given the metadata account is immutable.
  const setImmutableIx = getSetImmutableInstruction({
    metadata,
    authority,
    program,
  });

  // When the metadata authority tries to update the data.
  const setDataIx = getSetDataInstruction({
    metadata,
    authority,
    program,
    encoding: Encoding.Utf8,
    compression: Compression.None,
    format: Format.Json,
    dataSource: DataSource.Direct,
    data: getUtf8Encoder().encode('New data'),
  });
  const promise = pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions([setImmutableIx, setDataIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the transaction to fail.
  const error = await t.throwsAsync(promise);
  t.true(
    isSolanaError(
      error.cause,
      SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA
    )
  );
});

test.todo(
  'The metadata account needs to be extended for data changes that add more than 1KB'
);
