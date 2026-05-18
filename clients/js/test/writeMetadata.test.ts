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
