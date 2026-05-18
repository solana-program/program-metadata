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

it('updates a canonical metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following existing canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we update the metadata account with new data.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    await client.programMetadata.updateMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        data: newData,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('updates a canonical metadata account with data larger than a transaction size', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following existing canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we update the metadata account with new data with a lot of data.
    const newData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.updateMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        data: newData,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('updates a canonical metadata account using an existing buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following existing canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // And an existing buffer with the following data.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: newData })
        .sendTransaction();

    // When we update the metadata account using the existing buffer.
    await client.programMetadata.updateMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        buffer: buffer.address,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('updates a non-canonical metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following existing non-canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we update the metadata account with new data.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    await client.programMetadata.updateMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        data: newData,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('updates a non-canonical metadata account with data larger than a transaction size', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following existing non-canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we update the metadata account with new data.
    const newData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.updateMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        data: newData,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('updates a non-canonical metadata account using an existing buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following existing non-canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // And an existing buffer with the following data.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: newData })
        .sendTransaction();

    // When we update the metadata account using the existing buffer.
    await client.programMetadata.updateMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        buffer: buffer.address,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('cannot update a metadata account if no data or buffer is provided', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following existing canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we try to update a metadata account without providing data or buffer.
    const promise = client.programMetadata.updateMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
    });

    // Then we expect the following error to be thrown.
    await expect(promise).rejects.toThrow('Either `buffer` or `data` must be provided to update a metadata account.');
});

it('can close a new buffer after using it to update a new metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following existing canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we update the metadata account using the close buffer.
    const newData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.updateMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        data: newData,
        closeBuffer: true,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('can close an existing buffer after using it to update a new metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following existing canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // And an existing buffer with the following data and the same authority.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority, data: newData })
        .sendTransaction();

    // When we update the metadata account using
    // the existing buffer and the `closeBuffer` option.
    await client.programMetadata.updateMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        buffer: buffer.address,
        closeBuffer: true,
    });

    // Then we expect the buffer account to no longer exist.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetchMaybe(buffer.address);
    expect(bufferAccount.exists).toBe(false);
});
