import {
    address,
    generateKeyPairSigner,
    getUtf8Encoder,
    isSolanaError,
    SingleTransactionPlanResult,
    SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION,
    SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_REALLOC,
} from '@solana/kit';
import test from 'ava';
import {
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
    isProgramMetadataError,
    Metadata,
    PROGRAM_METADATA_ERROR__IMMUTABLE_METADATA_ACCOUNT,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol, REALLOC_LIMIT } from './_setup';

test('the program authority of a canonical metadata account can update its data using instruction data', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    const originalData = getUtf8Encoder().encode('Original data');
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When the program authority funds and updates the data of the metadata account using instruction data.
    const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            program,
            programData,
            encoding: Encoding.Utf8,
            compression: Compression.Gzip,
            format: Format.Json,
            dataSource: DataSource.Url,
            data: newData,
        }),
    ]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});

test('the explicit authority of a canonical metadata account can update its data using instruction data', async t => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    const originalData = getUtf8Encoder().encode('Original data');
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When the program authority sets an explicit authority,
    // funds the metadata account and that explicit authority updates the data.
    const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthority.address,
        }),
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority: explicitAuthority,
            program,
            programData,
            encoding: Encoding.Utf8,
            compression: Compression.Gzip,
            format: Format.Json,
            dataSource: DataSource.Url,
            data: newData,
        }),
    ]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});

test('the authority of a non-canonical metadata account can update its data using instruction data', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following initialized non-canonical metadata account.
    const originalData = getUtf8Encoder().encode('Original data');
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // When the metadata authority funds and updates the account data using instruction data.
    const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            program,
            encoding: Encoding.Utf8,
            compression: Compression.Gzip,
            format: Format.Json,
            dataSource: DataSource.Url,
            data: newData,
        }),
    ]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});

test('the program authority of a canonical metadata account can update its data using a pre-allocated buffer', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    const originalData = getUtf8Encoder().encode('Original data');
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // And the following pre-allocated buffer account with written data.
    const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: newData })
        .sendTransaction();

    // When the program authority updates the data of the metadata account using the buffer.
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    await client.sendTransaction([
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            buffer: buffer.address,
            program,
            programData,
            encoding: Encoding.Utf8,
            compression: Compression.Gzip,
            format: Format.Json,
            dataSource: DataSource.Url,
        }),
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
    ]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});

test('the explicit authority of a canonical metadata account can update its data using a pre-allocated buffer', async t => {
    // Given the following authorities and deployed program.
    const client = await createTestClient();
    const [authority, explicitAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSigner(),
    ]);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following initialized canonical metadata account.
    const originalData = getUtf8Encoder().encode('Original data');
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // And the following pre-allocated buffer account with written data.
    const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: newData })
        .sendTransaction();

    // When the program authority sets an explicit authority,
    // funds the metadata account and that explicit authority updates the data using the buffer.
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    await client.sendTransaction([
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority,
            program,
            programData,
            newAuthority: explicitAuthority.address,
        }),
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority: explicitAuthority,
            buffer: buffer.address,
            program,
            programData,
            encoding: Encoding.Utf8,
            compression: Compression.Gzip,
            format: Format.Json,
            dataSource: DataSource.Url,
        }),
    ]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});

test('the authority of a non-canonical metadata account can update its data using a pre-allocated buffer', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following initialized non-canonical metadata account.
    const originalData = getUtf8Encoder().encode('Original data');
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // And the following pre-allocated buffer account with written data.
    const newData = getUtf8Encoder().encode('https://example.com/new-data.json');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: newData })
        .sendTransaction();

    // When the metadata authority funds and updates the account using the pre-allocated buffer.
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: metadata,
            amount: extraRent,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            buffer: buffer.address,
            program,
            encoding: Encoding.Utf8,
            compression: Compression.Gzip,
            format: Format.Json,
            dataSource: DataSource.Url,
        }),
    ]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});

test('an immutable canonical metadata account cannot be updated', async t => {
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
        data: getUtf8Encoder().encode('Original data'),
    });
    const [metadata] = await findCanonicalPda({ program, seed: 'dummy' });

    // When the program authority makes the metadata account immutable
    // and tries to update its data in the same transaction.
    const promise = client.sendTransaction([
        client.programMetadata.instructions.setImmutable({
            metadata,
            authority,
            program,
            programData,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            program,
            programData,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.Json,
            dataSource: DataSource.Direct,
            data: getUtf8Encoder().encode('New data'),
        }),
    ]);

    // Then we expect the transaction to fail with the IMMUTABLE_METADATA_ACCOUNT program error.
    const error = await t.throwsAsync(promise);
    t.true(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION));
    if (!isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION)) return;
    const result = error.context.transactionPlanResult as SingleTransactionPlanResult;
    t.true(
        isProgramMetadataError(error.cause, result.plannedMessage, PROGRAM_METADATA_ERROR__IMMUTABLE_METADATA_ACCOUNT),
    );
});

test('an immutable non-canonical metadata account cannot be updated', async t => {
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
        data: getUtf8Encoder().encode('Original data'),
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // When the metadata authority makes the metadata account immutable
    // and tries to update its data in the same transaction.
    const promise = client.sendTransaction([
        client.programMetadata.instructions.setImmutable({
            metadata,
            authority,
            program,
        }),
        client.programMetadata.instructions.setData({
            metadata,
            authority,
            program,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            format: Format.Json,
            dataSource: DataSource.Direct,
            data: getUtf8Encoder().encode('New data'),
        }),
    ]);

    // Then we expect the transaction to fail with the IMMUTABLE_METADATA_ACCOUNT program error.
    const error = await t.throwsAsync(promise);
    t.true(isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION));
    if (!isSolanaError(error, SOLANA_ERROR__FAILED_TO_SEND_TRANSACTION)) return;
    const result = error.context.transactionPlanResult as SingleTransactionPlanResult;
    t.true(
        isProgramMetadataError(error.cause, result.plannedMessage, PROGRAM_METADATA_ERROR__IMMUTABLE_METADATA_ACCOUNT),
    );
});

test('The metadata account needs to be extended for data changes that add more than 1KB', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenKEGQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following initialized metadata account with 200 bytes of data.
    const originalData = getUtf8Encoder().encode('x'.repeat(200));
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'dummy',
        encoding: Encoding.None,
        compression: Compression.None,
        format: Format.None,
        dataSource: DataSource.Direct,
        data: originalData,
    });
    const [metadata] = await findNonCanonicalPda({ authority: authority.address, program, seed: 'dummy' });

    // And the following pre-allocated buffer account with written data.
    const newData = getUtf8Encoder().encode('x'.repeat(originalData.length + REALLOC_LIMIT + 1));
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data: newData })
        .sendTransactions();

    // And given the following instructions to fund extra rent, extend extra space and update the data.
    const extraRent = await client.getMinimumBalance(newData.length - originalData.length, { withoutHeader: true });
    const transferIx = client.system.instructions.transferSol({
        source: authority,
        destination: metadata,
        amount: extraRent,
    });
    const extendIx = client.programMetadata.instructions.extend({
        account: metadata,
        authority,
        length: REALLOC_LIMIT,
    });
    const setDataIx = client.programMetadata.instructions.setData({
        metadata,
        authority,
        program,
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        buffer: buffer.address,
    });

    // When we try to update the data without extending the account.
    const promise = client.sendTransaction([transferIx, setDataIx]);

    // Then we expect a program error.
    const error = await t.throwsAsync(promise);
    t.true(isSolanaError(error));
    t.true(isSolanaError(error.cause, SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_REALLOC));

    // But when we extend the account and try again.
    await client.sendTransaction([transferIx, extendIx, setDataIx]);

    // Then we expect the metadata account have the new data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    t.like(account.data, <Metadata>{
        encoding: Encoding.Utf8,
        compression: Compression.Gzip,
        format: Format.Json,
        dataSource: DataSource.Url,
        data: newData,
    });
});
