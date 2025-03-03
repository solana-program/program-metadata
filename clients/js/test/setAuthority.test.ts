import {
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  generateKeyPairSigner,
  getUtf8Encoder,
  isSolanaError,
  none,
  pipe,
  SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA,
  SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ARGUMENT,
  some,
} from '@solana/kit';
import test from 'ava';
import {
  ACCOUNT_HEADER_LENGTH,
  fetchBuffer,
  fetchMetadata,
  getAllocateInstruction,
  getSetAuthorityInstruction,
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

test('the program authority can set another authority on canonical metadata accounts', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, newAuthority] = await Promise.all([
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

  // When the program authority sets a new authority on the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: newAuthority.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(setAuthorityIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to record the new authority.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.authority, some(newAuthority.address));
});

test('the program authority can update an existing authority on canonical metadata accounts', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, explicitAuthorityA, explicitAuthorityB] = await Promise.all(
    [
      generateKeyPairSignerWithSol(client),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
    ]
  );
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // And given an explicit authority A is set on the metadata account.
  const firstSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthorityA.address,
  });

  // When the program authority sets another authority B on the metadata account.
  const secondSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthorityB.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [firstSetAuthorityIx, secondSetAuthorityIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to record the latest explicit authority.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.authority, some(explicitAuthorityB.address));
});

test('the program authority can remove an existing authority on canonical metadata accounts', async (t) => {
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

  // And given an explicit authority is set on the metadata account.
  const firstSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthority.address,
  });

  // When the program authority removes the explicit authority from the metadata account.
  const secondSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: null,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [firstSetAuthorityIx, secondSetAuthorityIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to have no explicit authority.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.authority, none());
});

test('an explicitly set authority can update itself on canonical metadata accounts', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, explicitAuthorityA, explicitAuthorityB] = await Promise.all(
    [
      generateKeyPairSignerWithSol(client),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
    ]
  );
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized canonical metadata account.
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // And given an explicit authority A is set on the metadata account.
  const firstSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthorityA.address,
  });

  // When the explicit authority A sets another authority B on the metadata account.
  const secondSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority: explicitAuthorityA,
    program,
    programData,
    newAuthority: explicitAuthorityB.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [firstSetAuthorityIx, secondSetAuthorityIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to record the latest explicit authority.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.authority, some(explicitAuthorityB.address));
});

test('an explicitly set authority can remove itself on canonical metadata accounts', async (t) => {
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

  // And given an explicit authority is set on the metadata account.
  const firstSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: explicitAuthority.address,
  });

  // When the explicit authority removes itself from the metadata account.
  const secondSetAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority: explicitAuthority,
    program,
    programData,
    newAuthority: null,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) =>
      appendTransactionMessageInstructions(
        [firstSetAuthorityIx, secondSetAuthorityIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to have no explicit authority.
  const account = await fetchMetadata(client.rpc, metadata);
  t.deepEqual(account.data.authority, none());
});

test('the authority of a non-canonical metadata account cannot set another authority on the account', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, newAuthority] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized non-canonical metadata account.
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    program,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the authority attempts to set a new authority on the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: newAuthority.address,
  });
  const promise = pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(setAuthorityIx, tx),
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

test('the authority of a non-canonical metadata account cannot remove itself on the account', async (t) => {
  // Given the following authorities and deployed program.
  const client = createDefaultSolanaClient();
  const [authority] = await Promise.all([generateKeyPairSignerWithSol(client)]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following initialized non-canonical metadata account.
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    program,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the authority attempts to remove itself from the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority,
    program,
    programData,
    newAuthority: null,
  });
  const promise = pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(setAuthorityIx, tx),
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

test('the authority can update itself on buffer accounts', async (t) => {
  // Given the following buffer and authorities.
  const client = createDefaultSolanaClient();
  const [payer, buffer, newAuthority] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
    generateKeyPairSigner(),
  ]);

  // And the following initialized buffer account.
  const bufferRent = await client.rpc
    .getMinimumBalanceForRentExemption(BigInt(ACCOUNT_HEADER_LENGTH))
    .send();
  const fundBufferIx = getTransferSolInstruction({
    source: payer,
    destination: buffer.address,
    amount: bufferRent,
  });
  const allocateBufferIx = getAllocateInstruction({
    buffer: buffer.address,
    authority: buffer,
  });

  // When the current authority sets another authority on the buffer account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: buffer.address,
    authority: buffer,
    newAuthority: newAuthority.address,
  });
  await pipe(
    await createDefaultTransaction(client, payer),
    (tx) =>
      appendTransactionMessageInstructions(
        [fundBufferIx, allocateBufferIx, setAuthorityIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to record the new authority.
  const account = await fetchBuffer(client.rpc, buffer.address);
  t.deepEqual(account.data.authority, some(newAuthority.address));
});

test('the authority cannot remove itself on buffer accounts', async (t) => {
  // Given the following buffer and authorities.
  const client = createDefaultSolanaClient();
  const [payer, buffer] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);

  // And the following initialized buffer account.
  const bufferRent = await client.rpc
    .getMinimumBalanceForRentExemption(BigInt(ACCOUNT_HEADER_LENGTH))
    .send();
  const fundBufferIx = getTransferSolInstruction({
    source: payer,
    destination: buffer.address,
    amount: bufferRent,
  });
  const allocateBufferIx = getAllocateInstruction({
    buffer: buffer.address,
    authority: buffer,
  });

  // When the current authority removes itself from the buffer account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: buffer.address,
    authority: buffer,
    newAuthority: null,
  });
  const promise = pipe(
    await createDefaultTransaction(client, payer),
    (tx) =>
      appendTransactionMessageInstructions(
        [fundBufferIx, allocateBufferIx, setAuthorityIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the transaction to fail.
  const error = await t.throwsAsync(promise);
  t.true(
    isSolanaError(
      error.cause,
      SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ARGUMENT
    )
  );
});
