import {
  address,
  appendTransactionMessageInstruction,
  getUtf8Encoder,
  pipe,
} from '@solana/web3.js';
import test from 'ava';
import { fetchMaybeMetadata, getCloseInstruction } from '../src';
import {
  createCanonicalBuffer,
  createCanonicalMetadata,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createKeypairBuffer,
  createNonCanonicalBuffer,
  createNonCanonicalMetadata,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';

test('it can close canonical metadata accounts', async (t) => {
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

  // When the program authority closes the metadata account.
  const closeIx = getCloseInstruction({
    account: metadata,
    authority,
    program,
    programData,
    destination: authority.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(closeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to no longer exist.
  const bufferAccount = await fetchMaybeMetadata(client.rpc, metadata);
  t.false(bufferAccount.exists);
});

test.todo('the set authority of a canonical metadata can close the account');

test.todo(
  'the current upgrade authority of program can close its canonical metadata account even when an authority is set on the account'
);

test('it can close non-canonical metadata accounts', async (t) => {
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

  // When the metadata authority closes the metadata account.
  const closeIx = getCloseInstruction({
    account: metadata,
    authority,
    program,
    destination: authority.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(closeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to no longer exist.
  const bufferAccount = await fetchMaybeMetadata(client.rpc, metadata);
  t.false(bufferAccount.exists);
});

test.skip('it can close canonical buffers', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following pre-allocated canonical buffer.
  const [buffer] = await createCanonicalBuffer(client, {
    authority,
    program,
    programData,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the program authority closes the buffer account.
  const closeIx = getCloseInstruction({
    account: buffer,
    authority,
    program,
    programData,
    destination: authority.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(closeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to no longer exist.
  const bufferAccount = await fetchMaybeMetadata(client.rpc, buffer);
  t.false(bufferAccount.exists);
});

test.todo(
  'the authority that created a canonical buffer can close it even if the upgrade authority of the program changed'
);

test.todo(
  'the current upgrade authority of program can close its canonical metadata account even if created by a different previous authority'
);

test.skip('it can close non-canonical buffers', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following pre-allocated non-canonical buffer.
  const [buffer] = await createNonCanonicalBuffer(client, {
    authority,
    program,
    seed: 'dummy',
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the buffer authority closes the buffer account.
  const closeIx = getCloseInstruction({
    account: buffer,
    authority,
    program,
    destination: authority.address,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(closeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to no longer exist.
  const bufferAccount = await fetchMaybeMetadata(client.rpc, buffer);
  t.false(bufferAccount.exists);
});

test('it can close keypair buffers', async (t) => {
  // Given the following payer.
  const client = createDefaultSolanaClient();
  const payer = await generateKeyPairSignerWithSol(client);

  // And the following pre-allocated keypair buffer.
  const buffer = await createKeypairBuffer(client, {
    payer,
    data: getUtf8Encoder().encode('Hello, World!'),
  });

  // When the buffer closes its own account.
  const closeIx = getCloseInstruction({
    account: buffer.address,
    authority: buffer,
    destination: payer.address,
  });
  await pipe(
    await createDefaultTransaction(client, payer),
    (tx) => appendTransactionMessageInstruction(closeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to no longer exist.
  const bufferAccount = await fetchMaybeMetadata(client.rpc, buffer.address);
  t.false(bufferAccount.exists);
});
