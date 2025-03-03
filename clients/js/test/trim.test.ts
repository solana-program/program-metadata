import {
  address,
  appendTransactionMessageInstructions,
  generateKeyPairSigner,
  getUtf8Encoder,
  lamports,
  pipe,
} from '@solana/kit';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  DataSource,
  Encoding,
  fetchMetadata,
  Format,
  getSetAuthorityInstruction,
  getSetDataInstruction,
  getTrimInstruction,
  Metadata,
} from '../src';
import {
  createCanonicalMetadata,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createNonCanonicalMetadata,
  generateKeyPairSignerWithSol,
  getBalance,
  getRentWithoutHeader,
  signAndSendTransaction,
} from './_setup';

test('the program authority of a canonical metadata account can trim it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const rentForAccountHeader = await client.rpc
    .getMinimumBalanceForRentExemption(0n)
    .send();
  const [authority, destination] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSignerWithSol(client, rentForAccountHeader),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following metadata account with 200 bytes of data.
  const data = getUtf8Encoder().encode('x'.repeat(200));
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    data,
    program,
    programData,
    seed: 'dummy',
  });

  // And given we remove 100 bytes of data.
  const reducedData = getUtf8Encoder().encode('x'.repeat(100));
  const reduceBytesIx = getSetDataInstruction({
    metadata,
    authority,
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: reducedData,
    program,
    programData,
  });

  // When we trim the metadata account.
  const trimIx = getTrimInstruction({
    account: metadata,
    authority,
    destination: destination.address,
    program,
    programData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([reduceBytesIx, trimIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be trimmed.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    data: reducedData,
  });

  // And we expect the destination account to have the rent difference.
  const rentDifference = await getRentWithoutHeader(client, 100);
  const destinationBalance = await getBalance(client, destination.address);
  t.is(destinationBalance, lamports(rentForAccountHeader + rentDifference));
});

test('the explicit authority of a canonical metadata account can trim it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const rentForAccountHeader = await client.rpc
    .getMinimumBalanceForRentExemption(0n)
    .send();
  const [authority, explicitAuthority, destination] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
    generateKeyPairSignerWithSol(client, rentForAccountHeader),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following metadata account with 200 bytes of data.
  const data = getUtf8Encoder().encode('x'.repeat(200));
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    data,
    program,
    programData,
    seed: 'dummy',
  });

  // And given an explicit authority is set.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    newAuthority: explicitAuthority.address,
    program,
    programData,
  });

  // And given we remove 100 bytes of data.
  const reducedData = getUtf8Encoder().encode('x'.repeat(100));
  const reduceBytesIx = getSetDataInstruction({
    metadata,
    authority: explicitAuthority,
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: reducedData,
  });

  // When we trim the metadata account.
  const trimIx = getTrimInstruction({
    account: metadata,
    authority: explicitAuthority,
    destination: destination.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [setAuthorityIx, reduceBytesIx, trimIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be trimmed.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    data: reducedData,
  });

  // And we expect the destination account to have the rent difference.
  const rentDifference = await getRentWithoutHeader(client, 100);
  const destinationBalance = await getBalance(client, destination.address);
  t.is(destinationBalance, lamports(rentForAccountHeader + rentDifference));
});

test('the metadata authority of a non-canonical metadata account can trim it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const rentForAccountHeader = await client.rpc
    .getMinimumBalanceForRentExemption(0n)
    .send();
  const [authority, destination] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSignerWithSol(client, rentForAccountHeader),
  ]);
  const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following metadata account with 200 bytes of data.
  const data = getUtf8Encoder().encode('x'.repeat(200));
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    data,
    program,
    seed: 'dummy',
  });

  // And given we remove 100 bytes of data.
  const reducedData = getUtf8Encoder().encode('x'.repeat(100));
  const reduceBytesIx = getSetDataInstruction({
    metadata,
    authority,
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: reducedData,
  });

  // When we trim the metadata account.
  const trimIx = getTrimInstruction({
    account: metadata,
    authority,
    destination: destination.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([reduceBytesIx, trimIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be trimmed.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    data: reducedData,
  });

  // And we expect the destination account to have the rent difference.
  const rentDifference = await getRentWithoutHeader(client, 100);
  const destinationBalance = await getBalance(client, destination.address);
  t.is(destinationBalance, lamports(rentForAccountHeader + rentDifference));
});
