import { getUtf8Encoder } from '@solana/kit';
import { expect, it } from 'vitest';

import { Compression, DataSource, Encoding, findCanonicalPda, findNonCanonicalPda, Format } from '../src';
import { getPdaDetailsForWriting } from '../src/cli/utils';
import {
    createCanonicalMetadataWithAuthority,
    createDeployedProgram,
    createTestClient,
    generateKeyPairSignerWithSol,
} from './_setup';

it('resolves the canonical metadata account for the program authority', async () => {
    // Given a program deployed with loader v3 and the following upgrade authority.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // When the program authority resolves the metadata account to write.
    const details = await getPdaDetailsForWriting(
        { rpc: client.rpc, identity: authority },
        { nonCanonical: false },
        program,
        'idl',
    );

    // Then we expect the canonical metadata account.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    expect(details).toStrictEqual({ programData, metadata, isCanonical: true });
});

it('resolves the non-canonical metadata account for the program authority when requested', async () => {
    // Given a program deployed with loader v3 and the following upgrade authority.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program] = await createDeployedProgram(client, authority);

    // When the program authority resolves a non-canonical metadata account to write.
    const details = await getPdaDetailsForWriting(
        { rpc: client.rpc, identity: authority },
        { nonCanonical: true },
        program,
        'idl',
    );

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

    // When the third party resolves a non-canonical metadata account to write.
    const details = await getPdaDetailsForWriting(
        { rpc: client.rpc, identity: authority },
        { nonCanonical: true },
        program,
        'idl',
    );

    // Then we expect the non-canonical metadata account derived from the third party.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    expect(details).toStrictEqual({ programData: undefined, metadata, isCanonical: false });
});

it('resolves the canonical metadata account for its additional authority', async () => {
    // Given an existing canonical metadata account with the following additional authority.
    const client = await createTestClient();
    const { additionalAuthority, metadata, program, programData } = await createCanonicalMetadataWithAuthority(client);

    // When the additional authority resolves the metadata account to write.
    const details = await getPdaDetailsForWriting(
        { rpc: client.rpc, identity: additionalAuthority },
        { nonCanonical: false },
        program,
        'idl',
    );

    // Then we expect the canonical metadata account.
    expect(details).toStrictEqual({ programData, metadata, isCanonical: true });

    // And we expect the program to accept a write from the additional authority.
    await client.programMetadata.writeMetadata({
        authority: additionalAuthority,
        program,
        programData: details.programData,
        metadata: details.metadata,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('Updated by the additional authority'),
    });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.data).toStrictEqual(getUtf8Encoder().encode('Updated by the additional authority'));
});

it('resolves the non-canonical metadata account for an additional authority when requested', async () => {
    // Given an existing canonical metadata account with the following additional authority.
    const client = await createTestClient();
    const { additionalAuthority, program } = await createCanonicalMetadataWithAuthority(client);

    // When the additional authority resolves a non-canonical metadata account to write.
    const details = await getPdaDetailsForWriting(
        { rpc: client.rpc, identity: additionalAuthority },
        { nonCanonical: true },
        program,
        'idl',
    );

    // Then we expect the non-canonical metadata account derived from the additional authority.
    const [metadata] = await findNonCanonicalPda({ program, authority: additionalAuthority.address, seed: 'idl' });
    expect(details).toStrictEqual({ programData: undefined, metadata, isCanonical: false });
});

it('rejects a third party resolving the canonical metadata account', async () => {
    // Given a program deployed with loader v3 and a third-party authority.
    const client = await createTestClient();
    const programAuthority = await generateKeyPairSignerWithSol(client);
    const authority = await generateKeyPairSignerWithSol(client);
    const [program] = await createDeployedProgram(client, programAuthority);

    // When the third party resolves the canonical metadata account to write.
    const promise = getPdaDetailsForWriting(
        { rpc: client.rpc, identity: authority },
        { nonCanonical: false },
        program,
        'idl',
    );

    // Then we expect an error pointing to the `--non-canonical` option.
    await expect(promise).rejects.toThrow('Use the `--non-canonical` option');
});
