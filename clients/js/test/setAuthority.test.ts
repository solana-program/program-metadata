import {
    generateKeyPairSigner,
    getUtf8Encoder,
    isSolanaError,
    none,
    SingleTransactionPlanResult,
    SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION,
    SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA,
    SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ARGUMENT,
    some,
} from '@solana/kit';
import { expect, test } from 'vitest';
import {
    ACCOUNT_HEADER_LENGTH,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
    isProgramMetadataError,
    PROGRAM_METADATA_ERROR__IMMUTABLE_METADATA_ACCOUNT,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

test('the program authority can set another authority on canonical metadata accounts', async () => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, newAuthority] = await Promise.all([
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

    // When the program authority sets a new authority on the metadata account.
    await client.programMetadata.instructions
        .setAuthority({ account: metadata, authority, program, programData, newAuthority: newAuthority.address })
        .sendTransaction();

    // Then we expect the metadata account to record the new authority.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toEqual(some(newAuthority.address));
});

test('the program authority can update an existing authority on canonical metadata accounts', async () => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthorityA, explicitAuthorityB] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
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

    // When the program authority sets explicit authority A
    // and then replaces it with explicit authority B.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthorityA.address,
        }),
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthorityB.address,
        }),
    ]);

    // Then we expect the metadata account to record the latest explicit authority.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toEqual(some(explicitAuthorityB.address));
});

test('the program authority can remove an existing authority on canonical metadata accounts', async () => {
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

    // When the program authority sets an explicit authority
    // and then removes it from the metadata account.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthority.address,
        }),
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: null,
        }),
    ]);

    // Then we expect the metadata account to have no explicit authority.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toEqual(none());
});

test('an explicitly set authority can update itself on canonical metadata accounts', async () => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthorityA, explicitAuthorityB] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
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

    // When the program authority sets explicit authority A,
    // and then explicit authority A sets explicit authority B.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthorityA.address,
        }),
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority: explicitAuthorityA,
            program,
            programData,
            newAuthority: explicitAuthorityB.address,
        }),
    ]);

    // Then we expect the metadata account to record the latest explicit authority.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toEqual(some(explicitAuthorityB.address));
});

test('an explicitly set authority can remove itself on canonical metadata accounts', async () => {
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

    // When the program authority sets an explicit authority,
    // and then that explicit authority removes itself.
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthority.address,
        }),
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority: explicitAuthority,
            program,
            programData,
            newAuthority: null,
        }),
    ]);

    // Then we expect the metadata account to have no explicit authority.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toEqual(none());
});

test('the authority of a non-canonical metadata account cannot set another authority on the account', async () => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, newAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

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

    // When the authority attempts to set a new authority on the metadata account.
    const promise = client.programMetadata.instructions
        .setAuthority({ account: metadata, authority, program, programData, newAuthority: newAuthority.address })
        .sendTransaction();

    // Then we expect the transaction to fail.
    const error = await promise.catch((e: unknown) => e);
    expect(isSolanaError(error)).toBe(true);
    if (!isSolanaError(error)) return;
    expect(isSolanaError(error.cause, SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA)).toBe(true);
});

test('the authority of a non-canonical metadata account cannot remove itself on the account', async () => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

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

    // When the authority attempts to remove itself from the metadata account.
    const promise = client.programMetadata.instructions
        .setAuthority({ account: metadata, authority, program, programData, newAuthority: null })
        .sendTransaction();

    // Then we expect the transaction to fail.
    const error = await promise.catch((e: unknown) => e);
    expect(isSolanaError(error)).toBe(true);
    if (!isSolanaError(error)) return;
    expect(isSolanaError(error.cause, SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA)).toBe(true);
});

test('the authority can update itself on buffer accounts', async () => {
    // Given the following buffer and authorities.
    const client = await createTestClient();
    const [payer, buffer, newAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
    ]);

    // When we fund, allocate, and update the authority of the buffer account.
    const bufferRent = await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH);
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: payer,
            destination: buffer.address,
            amount: bufferRent,
        }),
        client.programMetadata.instructions.allocate({
            buffer: buffer.address,
            authority: buffer,
        }),
        client.programMetadata.instructions.setAuthority({
            account: buffer.address,
            authority: buffer,
            newAuthority: newAuthority.address,
        }),
    ]);

    // Then we expect the buffer account to record the new authority.
    const account = await client.programMetadata.accounts.buffer.fetch(buffer.address);
    expect(account.data.authority).toEqual(some(newAuthority.address));
});

test('the authority cannot remove itself on buffer accounts', async () => {
    // Given the following buffer and authorities.
    const client = await createTestClient();
    const [payer, buffer] = await Promise.all([generateKeyPairSignerWithSol(client), generateKeyPairSigner()]);

    // When we fund, allocate, and attempt to remove the authority of the buffer account.
    const bufferRent = await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH);
    const promise = client.sendTransaction([
        client.system.instructions.transferSol({
            source: payer,
            destination: buffer.address,
            amount: bufferRent,
        }),
        client.programMetadata.instructions.allocate({
            buffer: buffer.address,
            authority: buffer,
        }),
        client.programMetadata.instructions.setAuthority({
            account: buffer.address,
            authority: buffer,
            newAuthority: null,
        }),
    ]);

    // Then we expect the transaction to fail.
    const error = await promise.catch((e: unknown) => e);
    expect(isSolanaError(error)).toBe(true);
    if (!isSolanaError(error)) return;
    expect(isSolanaError(error.cause, SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ARGUMENT)).toBe(true);
});

test('the authority cannot be changed on immutable metadata accounts', async () => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthority, anotherAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
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

    // When the program authority sets the explicit authority, the explicit
    // authority makes the metadata account immutable, then the program
    // authority tries to set yet another authority — all in one transaction.
    const promise = client.sendTransaction([
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
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: anotherAuthority.address,
        }),
    ]);

    // Then we expect the transaction to fail with the IMMUTABLE_METADATA_ACCOUNT program error.
    const error = await promise.catch((e: unknown) => e);
    expect(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION)).toBe(true);
    if (!isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION)) return;
    const result = error.context.transactionPlanResult as SingleTransactionPlanResult;
    expect(
        isProgramMetadataError(error.cause, result.plannedMessage, PROGRAM_METADATA_ERROR__IMMUTABLE_METADATA_ACCOUNT),
    ).toBe(true);
});
