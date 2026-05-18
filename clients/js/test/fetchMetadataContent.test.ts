import { address, generateKeyPairSigner, getUtf8Encoder } from '@solana/kit';
import { expect, it } from 'vitest';
import {
    Compression,
    Encoding,
    fetchAndParseAllMetadataContent,
    fetchAndParseMetadataContent,
    Format,
    packDirectData,
    packExternalData,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('fetches and parses direct IDLs from canonical metadata accounts', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following IDL exists for the program.
    const idl = '{"kind":"rootNode","standard":"codama","version":"1.0.0"}';
    await client.programMetadata.writeMetadata({
        ...packDirectData({ content: idl }),
        authority,
        program,
        programData,
        seed: 'idl',
        format: Format.Json,
    });

    // When we fetch the canonical IDL for the program.
    const result = await fetchAndParseMetadataContent(client.rpc, program, 'idl');

    // Then we expect the following IDL to be fetched and parsed.
    expect(result).toEqual({
        kind: 'rootNode',
        standard: 'codama',
        version: '1.0.0',
    });
});

it('fetches and parses direct IDLs from non-canonical metadata accounts', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And given the following IDL exists for the program.
    const idl = '{"kind":"rootNode","standard":"codama","version":"1.0.0"}';
    await client.programMetadata.writeMetadata({
        ...packDirectData({ content: idl }),
        authority,
        program,
        seed: 'idl',
        format: Format.Json,
    });

    // When we fetch the non-canonical IDL for the program.
    const result = await fetchAndParseMetadataContent(client.rpc, program, 'idl', authority.address);

    // Then we expect the following IDL to be fetched and parsed.
    expect(result).toEqual({
        kind: 'rootNode',
        standard: 'codama',
        version: '1.0.0',
    });
});

it('fetches and parses multiple direct IDLs from metadata accounts', async () => {
    // Given the following deployed program.
    const client = await createTestClient();
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    const metadata1 = await generateKeyPairSigner();
    const metadata2 = await generateKeyPairSigner();

    // And given the following IDLs exist for the programs.
    const idl1 = '{"kind":"rootNode","standard":"codama","version":"1.0.0"}';
    const idl2 = '{"kind":"rootNode","standard":"codama","version":"1.0.1"}';

    // We create a buffer account to hold the IDL data
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: getUtf8Encoder().encode(idl2) })
        .sendTransaction();

    // And we create metadata accounts for direct and external data
    await Promise.all([
        client.programMetadata.writeMetadata({
            ...packDirectData({ content: idl1 }),
            authority: metadata1,
            program,
            seed: 'idl',
            format: Format.Json,
        }),
        client.programMetadata.writeMetadata({
            ...packExternalData({
                address: buffer.address,
                offset: 96,
                length: idl2.length,
                compression: Compression.None,
                encoding: Encoding.Utf8,
            }),
            authority: metadata2,
            program,
            seed: 'idl',
            format: Format.Json,
        }),
    ]);

    // When we fetch the IDLs for the programs.
    const result = await fetchAndParseAllMetadataContent(client.rpc, [
        {
            program,
            seed: 'idl',
            authority: metadata1.address,
        },
        {
            program,
            seed: 'idl',
            authority: metadata2.address,
        },
    ]);

    // Then we expect the following IDLs to be fetched and parsed.
    expect(result).toEqual([
        {
            kind: 'rootNode',
            standard: 'codama',
            version: '1.0.0',
        },
        {
            kind: 'rootNode',
            standard: 'codama',
            version: '1.0.1',
        },
    ]);
}, 30_000);
