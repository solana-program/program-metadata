import {
  address,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  generateKeyPairSigner,
  getUtf8Encoder,
  pipe,
} from '@solana/kit';
import test from 'ava';
import {
  fetchMetadata,
  getSetAuthorityInstruction,
  getSetImmutableInstruction,
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

test('the program authority can of a canonical metadata account can make it immutable', async (t) => {
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
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the program authority sets the metadata account to be immutable.
  const setImmutableIx = getSetImmutableInstruction({
    metadata,
    authority,
    program,
    programData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(setImmutableIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be immutable.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.mutable, false);
});

test('the explicit authority of a canonical metadata account can make it immutable', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, explicitAuthority] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // And given the explicit authority is set on the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthority.address,
  });

  // When the explicit authority sets the metadata account to be immutable.
  const setImmutableIx = getSetImmutableInstruction({
    metadata,
    authority: explicitAuthority,
    program,
    programData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [setAuthorityIx, setImmutableIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be immutable.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.mutable, false);
});

test('the authority of a non-canonical metadata account can make it immutable', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following initialized non-canonical metadata account.
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    program,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the metadata authority sets the metadata account to be immutable.
  const setImmutableIx = getSetImmutableInstruction({
    metadata,
    authority,
    program,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(setImmutableIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be immutable.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.mutable, false);
});
