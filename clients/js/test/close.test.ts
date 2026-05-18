import {
    address,
    generateKeyPairSigner,
    getUtf8Encoder,
    isSolanaError,
    SOLANA_ERROR__INSTRUCTION_ERROR__INCORRECT_AUTHORITY,
} from '@solana/kit';
import { expect, it, test } from 'vitest';
import { Compression, DataSource, Encoding, findCanonicalPda, findNonCanonicalPda, Format } from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('can close canonical metadata accounts', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: getUtf8Encoder().encode('Hello, World!'),
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When the program authority closes the metadata account.
    await client.programMetadata.instructions
        .close({ account: metadata, authority, program, programData, destination: authority.address })
        .sendTransaction();

    // Then we expect the metadata account to no longer exist.
    const account = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    expect(account.exists).toBe(false);
});

test('the set authority of a canonical metadata can close the account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: getUtf8Encoder().encode('Hello, World!'),
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When an explicit authority is set on the metadata account
    // and that explicit authority closes the account.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            newAuthority: explicitAuthority.address,
            program,
            programData,
        }),
        client.programMetadata.instructions.close({
            account: metadata,
            authority: explicitAuthority,
            destination: explicitAuthority.address,
        }),
    ]);

    // Then we expect the metadata account to no longer exist.
    const account = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    expect(account.exists).toBe(false);
});

test('the current upgrade authority of program can close its canonical metadata account even when an authority is set on the account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: getUtf8Encoder().encode('Hello, World!'),
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When an explicit authority is set on the metadata account
    // and the program authority closes it anyway.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            newAuthority: explicitAuthority.address,
            program,
            programData,
        }),
        client.programMetadata.instructions.close({
            account: metadata,
            authority,
            destination: authority.address,
            program,
            programData,
        }),
    ]);

    // Then we expect the metadata account to no longer exist.
    const account = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    expect(account.exists).toBe(false);
});

it('can close non-canonical metadata accounts', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following initialized non-canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: getUtf8Encoder().encode('Hello, World!'),
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // When the metadata authority closes the metadata account.
    await client.programMetadata.instructions
        .close({ account: metadata, authority, program, destination: authority.address })
        .sendTransaction();

    // Then we expect the metadata account to no longer exist.
    const account = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    expect(account.exists).toBe(false);
});

it('can close canonical buffers', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following pre-allocated canonical buffer.
    await client.programMetadata.instructions
        .createCanonicalBuffer({
            authority,
            program,
            programData,
            seed: 'dummy',
            data: getUtf8Encoder().encode('Hello, World!'),
        })
        .sendTransaction();
    const [buffer] = await findCanonicalPda({ program, seed: 'dummy' });

    // When the program authority closes the buffer account.
    await client.programMetadata.instructions
        .close({ account: buffer, authority, program, programData, destination: authority.address })
        .sendTransaction();

    // Then we expect the buffer account to no longer exist.
    const account = await client.programMetadata.accounts.buffer.fetchMaybe(buffer);
    expect(account.exists).toBe(false);
});

it('can close non-canonical buffers', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following pre-allocated non-canonical buffer.
    await client.programMetadata.instructions
        .createNonCanonicalBuffer({
            authority,
            program,
            seed: 'dummy',
            data: getUtf8Encoder().encode('Hello, World!'),
        })
        .sendTransaction();
    const [buffer] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // When the buffer authority closes the buffer account.
    await client.programMetadata.instructions
        .close({ account: buffer, authority, program, destination: authority.address })
        .sendTransaction();

    // Then we expect the buffer account to no longer exist.
    const account = await client.programMetadata.accounts.buffer.fetchMaybe(buffer);
    expect(account.exists).toBe(false);
});

it('can close keypair buffers', async () => {
    // Given the following payer.
    const client = await createTestClient();
    const payer = await generateKeyPairSignerWithSol(client);

    // And the following pre-allocated keypair buffer.
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, payer, data: getUtf8Encoder().encode('Hello, World!') })
        .sendTransaction();

    // When the buffer closes its own account.
    await client.programMetadata.instructions
        .close({ account: buffer.address, authority: buffer, destination: payer.address })
        .sendTransaction();

    // Then we expect the buffer account to no longer exist.
    const account = await client.programMetadata.accounts.buffer.fetchMaybe(buffer.address);
    expect(account.exists).toBe(false);
});

it('cannot close a keypair buffer with a different authority set using the buffer keypair', async () => {
    // Given the following payer.
    const client = await createTestClient();
    const payer = await generateKeyPairSignerWithSol(client);

    // And the following pre-allocated keypair buffer.
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, payer, data: getUtf8Encoder().encode('Hello, World!') })
        .sendTransaction();

    // And we set a different authority on the buffer account.
    const bufferAuthority = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .setAuthority({ account: buffer.address, authority: buffer, newAuthority: bufferAuthority.address })
        .sendTransaction();

    // When the buffer keypair tries to close its own account.
    const promise = client.programMetadata.instructions
        .close({ account: buffer.address, authority: buffer, destination: payer.address })
        .sendTransaction();

    // Then we expect a program error.
    const error = await promise.catch((e: unknown) => e);
    expect(isSolanaError(error)).toBe(true);
    if (!isSolanaError(error)) return;
    expect(isSolanaError(error.cause, SOLANA_ERROR__INSTRUCTION_ERROR__INCORRECT_AUTHORITY)).toBe(true);
});

it('can close a keypair buffer with its authority', async () => {
    // Given the following payer.
    const client = await createTestClient();
    const payer = await generateKeyPairSignerWithSol(client);

    // And the following pre-allocated keypair buffer.
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, payer, data: getUtf8Encoder().encode('Hello, World!') })
        .sendTransaction();

    // And we set a different authority on the buffer account.
    const bufferAuthority = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .setAuthority({ account: buffer.address, authority: buffer, newAuthority: bufferAuthority.address })
        .sendTransaction();

    // When the authority closes the buffer account.
    await client.programMetadata.instructions
        .close({ account: buffer.address, authority: bufferAuthority, destination: payer.address })
        .sendTransaction();

    // Then we expect the buffer account to no longer exist.
    const account = await client.programMetadata.accounts.buffer.fetchMaybe(buffer.address);
    expect(account.exists).toBe(false);
});
