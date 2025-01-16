import {
  address,
  appendTransactionMessageInstructions,
  generateKeyPairSigner,
  getUtf8Encoder,
  pipe,
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
  Metadata,
} from '../src';
import {
  createCanonicalMetadata,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createNonCanonicalMetadata,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';
import { getTransferSolInstruction } from '@solana-program/system';

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
    metadata,
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

test.todo(
  'the program authority of a canonical metadata account can update its data using a pre-allocated buffer'
);

test.todo(
  'the explicit authority of a canonical metadata account can update its data using a pre-allocated buffer'
);

test.todo(
  'the authority of a non-canonical metadata account can update its data using a pre-allocated buffer'
);

test.todo(
  'The metadata account needs to be extended for data changes that add more than 1KB'
);

test.todo('an immutable canonical metadata account cannot be updated');

test.todo('an immutable non-canonical metadata account cannot be updated');
