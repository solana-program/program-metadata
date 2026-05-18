import { address, generateKeyPairSigner, getUtf8Encoder, none, some } from '@solana/kit';
import { expect, it } from 'vitest';

import {
    AccountDiscriminator,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
    Metadata,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('creates a canonical metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // When we create a canonical metadata account for the program.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('creates a canonical metadata account with data larger than a transaction size', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // When we create a canonical metadata account for the program with a lot of data.
    const largeData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: largeData,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: largeData.length,
        data: largeData,
    });
});

it('creates a canonical metadata account using an existing buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And an existing buffer with the following data.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data })
        .sendTransaction();

    // When we create a canonical metadata account using the existing buffer.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: buffer.address,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('creates a non-canonical metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // When we create a non-canonical metadata account for the program.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('creates a non-canonical metadata account with data larger than a transaction size', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // When we create a non-canonical metadata account for the program with a lot of data.
    const largeData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: largeData,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: largeData.length,
        data: largeData,
    });
});

it('creates a non-canonical metadata account using an existing buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And an existing buffer with the following data.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data })
        .sendTransaction();

    // When we create a non-canonical metadata account using the existing buffer.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: buffer.address,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('cannot create a metadata account if no data or buffer is provided', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // When we try to create a metadata account without providing data or buffer.
    const promise = client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
    });

    // Then we expect the following error to be thrown.
    await expect(promise).rejects.toThrow(
        'Either `buffer` or `data` must be provided to create a new metadata account.',
    );
});

it('can close an existing buffer after using it to create a new metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And an existing buffer with the same authority.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions.createBuffer({ newBuffer: buffer, authority, data }).sendTransaction();

    // When we create a canonical metadata account
    // using the existing buffer and the `closeBuffer` option.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: buffer.address,
        closeBuffer: true,
    });

    // Then we expect the buffer account to no longer exist.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetchMaybe(buffer.address);
    expect(bufferAccount.exists).toBe(false);
});
