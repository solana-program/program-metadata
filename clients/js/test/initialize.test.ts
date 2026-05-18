import { address, getUtf8Encoder, none, some } from '@solana/kit';
import { expect, it } from 'vitest';

import {
    ACCOUNT_HEADER_LENGTH,
    AccountDiscriminator,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
    getExternalDataEncoder,
    Metadata,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('initializes a non canonical PDA with direct data from instruction data', async () => {
    // Given the following authority and program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following metadata seed, data and address.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('Hello, World!');
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed });

    // When we initialize the metadata account with the data on the instruction.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH + data.length),
        }),
        await client.programMetadata.instructions.initialize({
            authority,
            program,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
            data,
        }),
    ]);

    // Then we expect the following metadata account to be created.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('initializes a non canonical PDA with url data from instruction data', async () => {
    // Given the following authority and program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following metadata seed, URL and address.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('https://example.com/my-metadata.json');
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed });

    // When we initialize the metadata account with the URL on the instruction.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH + data.length),
        }),
        await client.programMetadata.instructions.initialize({
            authority,
            program,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Url,
            data,
        }),
    ]);

    // Then we expect a URL metadata account to be created.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'dummy',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Url,
        dataLength: data.length,
        data,
    });
});

it('initializes a non canonical PDA with external data from instruction data', async () => {
    // Given the following authority and program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following metadata seed, external data and address.
    const seed = 'dummy';
    const dataAddress = address('7yokRnUjUPbpiLfyuA9NHwyQk66fYRW8mkrU5LPK3rnV');
    const data = getExternalDataEncoder().encode({
        address: dataAddress,
        offset: 32,
        length: some(ACCOUNT_HEADER_LENGTH),
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed });

    // When we initialize the metadata account with the external data on the instruction.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH + data.length),
        }),
        await client.programMetadata.instructions.initialize({
            authority,
            program,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.External,
            data,
        }),
    ]);

    // Then we expect an external metadata account to be created.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'dummy',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.External,
        dataLength: data.length,
        data,
    });
});

it('initializes a canonical PDA from instruction data', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following metadata seed, data and address.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('Hello, World!');
    const [metadata] = await findCanonicalPda({ program, seed });

    // When we initialize the metadata account with the data on the instruction.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH + data.length),
        }),
        await client.programMetadata.instructions.initialize({
            authority,
            program,
            programData,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
            data,
        }),
    ]);

    // Then we expect the following metadata account to be created.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'dummy',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('initializes a canonical PDA from a pre-allocated buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following pre-allocated buffer account.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('Hello, World!');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, data })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });

    // When we initialize the metadata account from the pre-allocated buffer at the same address.
    await client.programMetadata.instructions
        .initialize({
            metadata,
            authority,
            program,
            programData,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
        })
        .sendTransaction();

    // Then we expect the buffer account to now be a metadata account.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'dummy',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('initializes a non-canonical PDA from a pre-allocated buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following pre-allocated buffer account.
    const seed = 'dummy';
    const data = getUtf8Encoder().encode('Hello, World!');
    await client.programMetadata.instructions
        .createNonCanonicalBuffer({ authority, program, seed, data })
        .sendTransaction();
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed });

    // When we initialize the metadata account from the pre-allocated buffer at the same address.
    await client.programMetadata.instructions
        .initialize({
            metadata,
            authority,
            program,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
        })
        .sendTransaction();

    // Then we expect the buffer account to now be a metadata account.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'dummy',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});
