import { address, assertAccountExists, fetchEncodedAccount, generateKeyPairSigner, getUtf8Encoder } from '@solana/kit';
import { expect, test } from 'vitest';
import {
    ACCOUNT_HEADER_LENGTH,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

test('the program authority of a canonical metadata account can extend it', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
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

    // When we extend the metadata account by 100 bytes.
    const extraRent = await client.getMinimumBalance(100, { withoutHeader: true });
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.extend({
            account: metadata,
            authority,
            length: 100,
            program,
            programData,
        }),
    ]);

    // Then we expect the metadata account to be extended.
    const metadataAccount = await fetchEncodedAccount(client.rpc, metadata);
    assertAccountExists(metadataAccount);
    expect(metadataAccount.data.length).toBe(ACCOUNT_HEADER_LENGTH + 300);
});

test('the explicit authority of a canonical metadata account can extend it', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const [programAuthority, authority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
    ]);
    const [program, programData] = await createDeployedProgram(client, programAuthority);

    // And the following metadata account with 200 bytes of data.
    const data = getUtf8Encoder().encode('x'.repeat(200));
    await client.programMetadata.createMetadata({
        payer: programAuthority,
        authority: programAuthority,
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

    // When we extend the metadata account by 100 bytes
    // after setting an explicit authority for the metadata account.
    const extraRent = await client.getMinimumBalance(100, { withoutHeader: true });
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority: programAuthority,
            newAuthority: authority.address,
            program,
            programData,
        }),
        client.system.instructions.transferSol({
            source: programAuthority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.extend({
            account: metadata,
            authority,
            length: 100,
        }),
    ]);

    // Then we expect the metadata account to be extended.
    const metadataAccount = await fetchEncodedAccount(client.rpc, metadata);
    assertAccountExists(metadataAccount);
    expect(metadataAccount.data.length).toBe(ACCOUNT_HEADER_LENGTH + 300);
});

test('the metadata authority of a non-canonical metadata account can extend it', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
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

    // When we extend the metadata account by 100 bytes.
    const extraRent = await client.getMinimumBalance(100, { withoutHeader: true });
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.extend({
            account: metadata,
            authority,
            length: 100,
        }),
    ]);

    // Then we expect the metadata account to be extended.
    const metadataAccount = await fetchEncodedAccount(client.rpc, metadata);
    assertAccountExists(metadataAccount);
    expect(metadataAccount.data.length).toBe(ACCOUNT_HEADER_LENGTH + 300);
});
