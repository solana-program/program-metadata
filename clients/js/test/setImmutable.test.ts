import { address, generateKeyPairSigner, getUtf8Encoder } from '@solana/kit';
import test from 'ava';
import { Compression, DataSource, Encoding, findCanonicalPda, findNonCanonicalPda, Format } from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

test('the program authority can of a canonical metadata account can make it immutable', async t => {
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

    // When the program authority sets the metadata account to be immutable.
    await client.programMetadata.instructions
        .setImmutable({ metadata, authority, program, programData })
        .sendTransaction();

    // Then we expect the metadata account to be immutable.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.deepEqual(account.data.mutable, false);
});

test('the explicit authority of a canonical metadata account can make it immutable', async t => {
    // Given the following authorities and deployed program.
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

    // When the explicit authority is set on the metadata account
    // and then sets the metadata account to be immutable.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthority.address,
        }),
        client.programMetadata.instructions.setImmutable({
            metadata,
            authority: explicitAuthority,
            program,
            programData,
        }),
    ]);

    // Then we expect the metadata account to be immutable.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.deepEqual(account.data.mutable, false);
});

test('the authority of a non-canonical metadata account can make it immutable', async t => {
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

    // When the metadata authority sets the metadata account to be immutable.
    await client.programMetadata.instructions.setImmutable({ metadata, authority, program }).sendTransaction();

    // Then we expect the metadata account to be immutable.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.deepEqual(account.data.mutable, false);
});
