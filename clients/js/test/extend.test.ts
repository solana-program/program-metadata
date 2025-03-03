import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  appendTransactionMessageInstructions,
  assertAccountExists,
  fetchEncodedAccount,
  generateKeyPairSigner,
  getUtf8Encoder,
  pipe,
} from '@solana/kit';
import test from 'ava';
import {
  ACCOUNT_HEADER_LENGTH,
  getExtendInstruction,
  getSetAuthorityInstruction,
} from '../src';
import {
  createCanonicalMetadata,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createNonCanonicalMetadata,
  generateKeyPairSignerWithSol,
  getRentWithoutHeader,
  signAndSendTransaction,
} from './_setup';

test('the program authority of a canonical metadata account can extend it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
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

  // When we extend the metadata account by 100 bytes.
  const extraRent = await getRentWithoutHeader(client, 100);
  const transferIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });
  const extendIx = getExtendInstruction({
    account: metadata,
    authority,
    length: 100,
    program,
    programData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([transferIx, extendIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be extended.
  const metadataAccount = await fetchEncodedAccount(client.rpc, metadata);
  assertAccountExists(metadataAccount);
  t.is(metadataAccount.data.length, ACCOUNT_HEADER_LENGTH + 300);
});

test('the explicit authority of a canonical metadata account can extend it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const [programAuthority, authority] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);
  const [program, programData] = await createDeployedProgram(
    client,
    programAuthority
  );

  // And the following metadata account with 200 bytes of data.
  const data = getUtf8Encoder().encode('x'.repeat(200));
  const [metadata] = await createCanonicalMetadata(client, {
    authority: programAuthority,
    data,
    program,
    programData,
    seed: 'dummy',
  });

  // And an explicit authority is set for the metadata account.
  const setAuthorityIx = getSetAuthorityInstruction({
    account: metadata,
    authority: programAuthority,
    newAuthority: authority.address,
    program,
    programData,
  });

  // When we extend the metadata account by 100 bytes.
  const extraRent = await getRentWithoutHeader(client, 100);
  const transferIx = getTransferSolInstruction({
    source: programAuthority,
    destination: metadata,
    amount: extraRent,
  });
  const extendIx = getExtendInstruction({
    account: metadata,
    authority,
    length: 100,
  });
  await pipe(
    await createDefaultTransaction(client, programAuthority),
    (tx) =>
      appendTransactionMessageInstructions(
        [setAuthorityIx, transferIx, extendIx],
        tx
      ),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be extended.
  const metadataAccount = await fetchEncodedAccount(client.rpc, metadata);
  assertAccountExists(metadataAccount);
  t.is(metadataAccount.data.length, ACCOUNT_HEADER_LENGTH + 300);
});

test('the metadata authority of a non-canonical metadata account can extend it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following metadata account with 200 bytes of data.
  const data = getUtf8Encoder().encode('x'.repeat(200));
  const [metadata] = await createNonCanonicalMetadata(client, {
    authority,
    data,
    program,
    seed: 'dummy',
  });

  // When we extend the metadata account by 100 bytes.
  const extraRent = await getRentWithoutHeader(client, 100);
  const transferIx = getTransferSolInstruction({
    source: authority,
    destination: metadata,
    amount: extraRent,
  });
  const extendIx = getExtendInstruction({
    account: metadata,
    authority,
    length: 100,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([transferIx, extendIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be extended.
  const metadataAccount = await fetchEncodedAccount(client.rpc, metadata);
  assertAccountExists(metadataAccount);
  t.is(metadataAccount.data.length, ACCOUNT_HEADER_LENGTH + 300);
});
