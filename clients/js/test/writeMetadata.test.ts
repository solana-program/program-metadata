import { getUtf8Encoder, none } from '@solana/kit';
import { expect, it } from 'vitest';

import { AccountDiscriminator, Compression, DataSource, Encoding, findCanonicalPda, Format, Metadata } from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('creates a new metadata account if it does not exist', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following canonical metadata account does not exist.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const initialAccount = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    expect(initialAccount.exists).toBe(false);

    // When we upload this canonical metadata account.
    const data = getUtf8Encoder().encode('Some data');
    await client.programMetadata.writeMetadata({
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

    // Then we expect the metadata account to be created.
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
        dataSource: DataSource.Direct,
        format: Format.Json,
        dataLength: data.length,
        data,
    });
});

it('updates a metadata account if it exists', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following canonical metadata account exists.
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

    // When we upload this canonical metadata account with different data.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    await client.programMetadata.writeMetadata({
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

it('initializes a pre-allocated buffer left at the metadata PDA by an interrupted create', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a fully written pre-allocated buffer
    // at the canonical metadata PDA, never initialized as a metadata account.
    const seed = 'idl';
    const data = getUtf8Encoder().encode('Interrupted create');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: data.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions.write({ buffer: metadata, authority, offset: 0, data }).sendTransaction();

    // When we upload the metadata account with the same data.
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is initialized as the metadata account.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        dataLength: data.length,
        data,
    });
});

it('rewrites a pre-allocated buffer at the metadata PDA when the data changed', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a pre-allocated buffer with stale
    // data of the same length at the canonical metadata PDA.
    const seed = 'idl';
    const staleData = getUtf8Encoder().encode('STALE DATA');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: staleData.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: staleData })
        .sendTransaction();

    // When we upload the metadata account with new data of the same length.
    const data = getUtf8Encoder().encode('FRESH DATA');
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is rewritten and initialized as metadata.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
});

it('extends a pre-allocated buffer at the metadata PDA when the new data is larger', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a small pre-allocated buffer at the
    // canonical metadata PDA.
    const seed = 'idl';
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: 4 })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: getUtf8Encoder().encode('TINY') })
        .sendTransaction();

    // When we upload the metadata account with larger data.
    const data = getUtf8Encoder().encode('MUCH LARGER DATA');
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is grown, rewritten and initialized.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
});

it('rejects writes smaller than a pre-allocated buffer at the metadata PDA', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a large fully written pre-allocated
    // buffer at the canonical metadata PDA.
    const seed = 'idl';
    const staleData = getUtf8Encoder().encode('THIRTY-TWO BYTES OF STALE DATA');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: staleData.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: staleData })
        .sendTransaction();

    // When we upload the metadata account with smaller data, then it fails with
    // an actionable error instead of misreporting the account's data length.
    const data = getUtf8Encoder().encode('small');
    await expect(
        client.programMetadata.writeMetadata({
            authority,
            program,
            programData,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            data,
        }),
    ).rejects.toThrow(/close-buffer/u);
});
