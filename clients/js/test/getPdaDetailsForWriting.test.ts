import { getUtf8Encoder } from '@solana/kit';
import { expect, it } from 'vitest';

import { Compression, DataSource, Encoding, findCanonicalPda, findNonCanonicalPda, Format } from '../src';
import { Client, getPdaDetailsForWriting } from '../src/cli/utils';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('resolves the canonical metadata account for the program authority', async () => {
    // Given a program deployed with loader v3 and the following upgrade authority.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);
    const cliClient = { ...client, identity: authority } as unknown as Client;

    // When the program authority resolves the metadata account to write.
    const details = await getPdaDetailsForWriting(cliClient, { nonCanonical: false }, program, 'idl');

    // Then we expect the canonical metadata account.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    expect(details).toStrictEqual({ programData, metadata, isCanonical: true });
});

it('resolves the non-canonical metadata account for the program authority when requested', async () => {
    // Given a program deployed with loader v3 and the following upgrade authority.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program] = await createDeployedProgram(client, authority);
    const cliClient = { ...client, identity: authority } as unknown as Client;

    // When the program authority resolves a non-canonical metadata account to write.
    const details = await getPdaDetailsForWriting(cliClient, { nonCanonical: true }, program, 'idl');

    // Then we expect the non-canonical metadata account derived from the authority.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    expect(details).toStrictEqual({ programData: undefined, metadata, isCanonical: false });

    // And we expect the program to accept it as a non-canonical metadata account.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData: details.programData,
        metadata: details.metadata,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('Some data'),
    });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.canonical).toBe(false);
});

it('resolves the non-canonical metadata account for a third party', async () => {
    // Given a program deployed with loader v3 and a third-party authority.
    const client = await createTestClient();
    const programAuthority = await generateKeyPairSignerWithSol(client);
    const authority = await generateKeyPairSignerWithSol(client);
    const [program] = await createDeployedProgram(client, programAuthority);
    const cliClient = { ...client, identity: authority } as unknown as Client;

    // When the third party resolves a non-canonical metadata account to write.
    const details = await getPdaDetailsForWriting(cliClient, { nonCanonical: true }, program, 'idl');

    // Then we expect the non-canonical metadata account derived from the third party.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    expect(details).toStrictEqual({ programData: undefined, metadata, isCanonical: false });
});
