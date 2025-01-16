import { getTransferSolInstruction } from '@solana-program/system';
import {
  address,
  appendTransactionMessageInstructions,
  generateKeyPairSigner,
  none,
  pipe,
  some,
} from '@solana/web3.js';
import test from 'ava';
import {
  AccountDiscriminator,
  Buffer,
  fetchBuffer,
  findCanonicalPda,
  findNonCanonicalPda,
  getAllocateInstruction,
} from '../src';
import {
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';

test('it allocates a canonical PDA buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following seed derivation for the buffer.
  const seed = 'dummy';
  const [buffer] = await findCanonicalPda({ program, seed });

  // And given the buffer account is pre-funded.
  const rent = await client.rpc.getMinimumBalanceForRentExemption(96n).send();
  const preFundIx = getTransferSolInstruction({
    source: authority,
    destination: buffer,
    amount: rent,
  });

  // When we allocate the buffer account for a canonical PDA.
  const allocateIx = getAllocateInstruction({
    buffer,
    authority,
    program,
    programData,
    seed,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([preFundIx, allocateIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the following buffer account to be created.
  const bufferAccount = await fetchBuffer(client.rpc, buffer);
  t.like(bufferAccount.data, <Buffer>{
    discriminator: AccountDiscriminator.Buffer,
    program: some(program),
    authority: some(authority.address),
    canonical: true,
    seed,
    data: new Uint8Array([]),
  });
});

test('it allocates a non-canonical PDA buffer', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following seed derivation for the buffer.
  const seed = 'dummy';
  const [buffer] = await findNonCanonicalPda({
    program,
    authority: authority.address,
    seed,
  });

  // And given the buffer account is pre-funded.
  const rent = await client.rpc.getMinimumBalanceForRentExemption(96n).send();
  const preFundIx = getTransferSolInstruction({
    source: authority,
    destination: buffer,
    amount: rent,
  });

  // When we allocate the buffer account for a canonical PDA.
  const allocateIx = getAllocateInstruction({
    buffer,
    authority,
    program,
    seed,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([preFundIx, allocateIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the following buffer account to be created.
  const bufferAccount = await fetchBuffer(client.rpc, buffer);
  t.like(bufferAccount.data, <Buffer>{
    discriminator: AccountDiscriminator.Buffer,
    program: some(program),
    authority: some(authority.address),
    canonical: false,
    seed,
    data: new Uint8Array([]),
  });
});

test('it allocates a keypair buffer', async (t) => {
  // Given the following payer and buffer keypairs.
  const client = createDefaultSolanaClient();
  const [payer, buffer] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);

  // And given the buffer account is pre-funded.
  const rent = await client.rpc.getMinimumBalanceForRentExemption(96n).send();
  const preFundIx = getTransferSolInstruction({
    source: payer,
    destination: buffer.address,
    amount: rent,
  });

  // When we allocate the buffer account for a canonical PDA.
  const allocateIx = getAllocateInstruction({
    buffer: buffer.address,
    authority: buffer,
  });
  await pipe(
    await createDefaultTransaction(client, payer),
    (tx) => appendTransactionMessageInstructions([preFundIx, allocateIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the following buffer account to be created.
  const bufferAccount = await fetchBuffer(client.rpc, buffer.address);
  t.like(bufferAccount.data, <Buffer>{
    discriminator: AccountDiscriminator.Buffer,
    program: none(),
    authority: none(),
    canonical: false,
    seed: '',
    data: new Uint8Array([]),
  });
});
