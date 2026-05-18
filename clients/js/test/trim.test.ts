import { address, generateKeyPairSigner, getUtf8Encoder, lamports } from '@solana/kit';
import { expect, test } from 'vitest';

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
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol, getBalance } from './_setup';

test('the program authority of a canonical metadata account can trim it', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const rentForAccountHeader = await client.getMinimumBalance(0);
    const [authority, destination] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSignerWithSol(client, rentForAccountHeader),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following metadata account with 200 bytes of data.
    const data = getUtf8Encoder().encode('x'.repeat(200));
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data,
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When we remove 100 bytes of data and trim the metadata account.
    const reducedData = getUtf8Encoder().encode('x'.repeat(100));
    await client.sendTransaction([
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            encoding: Encoding.None,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
            data: reducedData,
            program,
            programData,
        }),
        client.programMetadata.instructions.trim({
            account: metadata,
            authority,
            destination: destination.address,
            program,
            programData,
        }),
    ]);

    // Then we expect the metadata account to be trimmed.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        data: reducedData,
    });

    // And we expect the destination account to have the rent difference.
    const rentDifference = await client.getMinimumBalance(100, { withoutHeader: true });
    const destinationBalance = await getBalance(client, destination.address);
    expect(destinationBalance).toBe(lamports(rentForAccountHeader + rentDifference));
});

test('the explicit authority of a canonical metadata account can trim it', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const rentForAccountHeader = await client.getMinimumBalance(0);
    const [authority, explicitAuthority, destination] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
        generateKeyPairSignerWithSol(client, rentForAccountHeader),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following metadata account with 200 bytes of data.
    const data = getUtf8Encoder().encode('x'.repeat(200));
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data,
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When an explicit authority is set, removes 100 bytes of data, and trims the metadata account.
    const reducedData = getUtf8Encoder().encode('x'.repeat(100));
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            newAuthority: explicitAuthority.address,
            program,
            programData,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority: explicitAuthority,
            encoding: Encoding.None,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
            data: reducedData,
        }),
        client.programMetadata.instructions.trim({
            account: metadata,
            authority: explicitAuthority,
            destination: destination.address,
        }),
    ]);

    // Then we expect the metadata account to be trimmed.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        data: reducedData,
    });

    // And we expect the destination account to have the rent difference.
    const rentDifference = await client.getMinimumBalance(100, { withoutHeader: true });
    const destinationBalance = await getBalance(client, destination.address);
    expect(destinationBalance).toBe(lamports(rentForAccountHeader + rentDifference));
});

test('the metadata authority of a non-canonical metadata account can trim it', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const rentForAccountHeader = await client.getMinimumBalance(0);
    const [authority, destination] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSignerWithSol(client, rentForAccountHeader),
    ]);
    const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following metadata account with 200 bytes of data.
    const data = getUtf8Encoder().encode('x'.repeat(200));
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data,
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // When we remove 100 bytes of data and trim the metadata account.
    const reducedData = getUtf8Encoder().encode('x'.repeat(100));
    await client.sendTransaction([
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            encoding: Encoding.None,
            compression: Compression.None,
            format: Format.None,
            dataSource: DataSource.Direct,
            data: reducedData,
        }),
        client.programMetadata.instructions.trim({
            account: metadata,
            authority,
            destination: destination.address,
        }),
    ]);

    // Then we expect the metadata account to be trimmed.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        data: reducedData,
    });

    // And we expect the destination account to have the rent difference.
    const rentDifference = await client.getMinimumBalance(100, { withoutHeader: true });
    const destinationBalance = await getBalance(client, destination.address);
    expect(destinationBalance).toBe(lamports(rentForAccountHeader + rentDifference));
});
