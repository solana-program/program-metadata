import { address, generateKeyPairSigner, getUtf8Encoder } from '@solana/kit';
import test from 'ava';
import { AccountDiscriminator, Buffer, findCanonicalPda, findNonCanonicalPda } from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

test('it writes to canonical PDA buffers', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following pre-allocated buffer account.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('Hello, World!');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: data.length })
        .sendTransaction();
    const [buffer] = await findCanonicalPda({ program, seed });

    // When we write some data to the buffer account.
    await client.programMetadata.instructions.write({ buffer, authority, offset: 0, data }).sendTransaction();

    // Then we expect the buffer account to contain the written data.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer);
    t.like(bufferAccount.data, <Partial<Buffer>>{ discriminator: AccountDiscriminator.Buffer, canonical: true, data });
});

test('it writes to non-canonical PDA buffers', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following pre-allocated buffer account.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('Hello, World!');
    await client.programMetadata.instructions
        .createNonCanonicalBuffer({ authority, program, seed, dataLength: data.length })
        .sendTransaction();
    const [buffer] = await findNonCanonicalPda({ authority: authority.address, program, seed });

    // When we write some data to the buffer account.
    await client.programMetadata.instructions.write({ buffer, authority, offset: 0, data }).sendTransaction();

    // Then we expect the buffer account to contain the written data.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer);
    t.like(bufferAccount.data, <Partial<Buffer>>{ discriminator: AccountDiscriminator.Buffer, canonical: false, data });
});

test('it writes to keypair buffers', async t => {
    // Given the following payer.
    const client = await createTestClient();
    const payer = await generateKeyPairSignerWithSol(client);

    // And the following pre-allocated keypair buffer account.
    const data = getUtf8Encoder().encode('Hello, World!');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, payer, data: new Uint8Array(data.length) })
        .sendTransaction();

    // When we write some data to the buffer account.
    await client.programMetadata.instructions
        .write({ buffer: buffer.address, authority: buffer, offset: 0, data })
        .sendTransaction();

    // Then we expect the buffer account to contain the written data.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer.address);
    t.like(bufferAccount.data, <Partial<Buffer>>{ discriminator: AccountDiscriminator.Buffer, data });
});

test('it appends to the end of buffers when doing multiple writes', async t => {
    // Given the following payer.
    const client = await createTestClient();
    const payer = await generateKeyPairSignerWithSol(client);

    // And the following pre-allocated keypair buffer account.
    const dataChunk1 = getUtf8Encoder().encode('[Data part 1]');
    const dataChunk2 = getUtf8Encoder().encode('[Data part 2]');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({
            newBuffer: buffer,
            authority: buffer,
            payer,
            data: new Uint8Array(dataChunk1.length + dataChunk2.length),
        })
        .sendTransaction();

    // When we write some data to the buffer account.
    await client.sendTransaction([
        client.programMetadata.instructions.write({
            buffer: buffer.address,
            authority: buffer,
            offset: 0,
            data: dataChunk1,
        }),
        client.programMetadata.instructions.write({
            buffer: buffer.address,
            authority: buffer,
            offset: dataChunk1.length,
            data: dataChunk2,
        }),
    ]);

    // Then we expect the buffer account to contain the written data.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer.address);
    t.like(bufferAccount.data, <Partial<Buffer>>{
        discriminator: AccountDiscriminator.Buffer,
        data: new Uint8Array([...dataChunk1, ...dataChunk2]),
    });
});

test('it writes to buffers using other buffers', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And an existing keypair buffer account with data.
    const data = getUtf8Encoder().encode('Hello, World!');
    const sourceBuffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: sourceBuffer, authority: sourceBuffer, data })
        .sendTransaction();

    // And the following pre-allocated pre-funded empty canonical buffer account.
    const seed = 'dummy';
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: data.length })
        .sendTransaction();
    const [buffer] = await findCanonicalPda({ program, seed });

    // When we write some data to the canonical buffer account
    // using the keypair buffer account as source.
    await client.programMetadata.instructions
        .write({ buffer, authority, offset: 0, sourceBuffer: sourceBuffer.address })
        .sendTransaction();

    // Then we expect the buffer account to contain the data from the source buffer.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer);
    t.like(bufferAccount.data, <Partial<Buffer>>{ discriminator: AccountDiscriminator.Buffer, canonical: true, data });
});
