import {
  address,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  getUtf8Encoder,
  pipe,
} from '@solana/kit';
import test from 'ava';
import {
  AccountDiscriminator,
  Buffer,
  fetchBuffer,
  getWriteInstruction,
} from '../src';
import {
  createCanonicalBuffer,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  createKeypairBuffer,
  createNonCanonicalBuffer,
  generateKeyPairSignerWithSol,
  signAndSendTransaction,
} from './_setup';

test('it writes to canonical PDA buffers', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following pre-allocated buffer account.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');
  const [buffer] = await createCanonicalBuffer(client, {
    authority,
    program,
    programData,
    seed,
    dataLength: data.length,
  });

  // When we write some data to the buffer account.
  const writeIx = getWriteInstruction({ buffer, authority, offset: 0, data });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(writeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to contain the written data.
  const bufferAccount = await fetchBuffer(client.rpc, buffer);
  t.like(bufferAccount.data, <Partial<Buffer>>{
    discriminator: AccountDiscriminator.Buffer,
    canonical: true,
    data,
  });
});

test('it writes to non-canonical PDA buffers', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And the following pre-allocated buffer account.
  const seed = 'dummy';
  const data = getUtf8Encoder().encode('Hello, World!');
  const [buffer] = await createNonCanonicalBuffer(client, {
    authority,
    program,
    seed,
    dataLength: data.length,
  });

  // When we write some data to the buffer account.
  const writeIx = getWriteInstruction({ buffer, authority, offset: 0, data });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstruction(writeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to contain the written data.
  const bufferAccount = await fetchBuffer(client.rpc, buffer);
  t.like(bufferAccount.data, <Partial<Buffer>>{
    discriminator: AccountDiscriminator.Buffer,
    canonical: false,
    data,
  });
});

test('it writes to keypair buffers', async (t) => {
  // Given the following payer.
  const client = createDefaultSolanaClient();
  const payer = await generateKeyPairSignerWithSol(client);

  // And the following pre-allocated keypair buffer account.
  const data = getUtf8Encoder().encode('Hello, World!');
  const buffer = await createKeypairBuffer(client, {
    payer,
    dataLength: data.length,
  });

  // When we write some data to the buffer account.
  const writeIx = getWriteInstruction({
    buffer: buffer.address,
    authority: buffer,
    offset: 0,
    data,
  });
  await pipe(
    await createDefaultTransaction(client, payer),
    (tx) => appendTransactionMessageInstruction(writeIx, tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to contain the written data.
  const bufferAccount = await fetchBuffer(client.rpc, buffer.address);
  t.like(bufferAccount.data, <Partial<Buffer>>{
    discriminator: AccountDiscriminator.Buffer,
    data,
  });
});

test('it appends to the end of buffers when doing multiple writes', async (t) => {
  // Given the following payer.
  const client = createDefaultSolanaClient();
  const payer = await generateKeyPairSignerWithSol(client);

  // And the following pre-allocated keypair buffer account.
  const dataChunk1 = getUtf8Encoder().encode('[Data part 1]');
  const dataChunk2 = getUtf8Encoder().encode('[Data part 2]');
  const buffer = await createKeypairBuffer(client, {
    payer,
    dataLength: dataChunk1.length + dataChunk2.length,
  });

  // When we write some data to the buffer account.
  const firstWriteIx = getWriteInstruction({
    buffer: buffer.address,
    authority: buffer,
    offset: 0,
    data: dataChunk1,
  });
  const secondWriteIx = getWriteInstruction({
    buffer: buffer.address,
    authority: buffer,
    offset: dataChunk1.length,
    data: dataChunk2,
  });
  await pipe(
    await createDefaultTransaction(client, payer),
    (tx) =>
      appendTransactionMessageInstructions([firstWriteIx, secondWriteIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the buffer account to contain the written data.
  const bufferAccount = await fetchBuffer(client.rpc, buffer.address);
  t.like(bufferAccount.data, <Partial<Buffer>>{
    discriminator: AccountDiscriminator.Buffer,
    data: new Uint8Array([...dataChunk1, ...dataChunk2]),
  });
});
