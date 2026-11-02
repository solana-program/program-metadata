import { address, generateKeyPairSigner, getUtf8Encoder, none, ReadonlyUint8Array, some } from '@solana/kit';
import { expect, it } from 'vitest';

import {
    AccountDiscriminator,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
    getAccountSize,
    getCreateMetadataInstructionPlan,
    Metadata,
} from '../src';
import {
    createDeployedProgram,
    createTestClient,
    generateKeyPairSignerWithSol,
    getBalance,
    REALLOC_LIMIT,
} from './_setup';

it('creates a canonical metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // When we create a canonical metadata account for the program.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    await client.programMetadata.createMetadata({
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

    // Then we expect the following metadata account to be created.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
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
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('creates a canonical metadata account with data larger than a transaction size', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // When we create a canonical metadata account for the program with a lot of data.
    const largeData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: largeData,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
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
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: largeData.length,
        data: largeData,
    });
});

it.each([
    { singleExtendPerTransaction: false, label: 'densely packed extend instructions' },
    { singleExtendPerTransaction: true, label: 'a single extend instruction per transaction' },
])(
    'creates a canonical metadata account with data larger than the realloc limit using $label',
    async ({ singleExtendPerTransaction }) => {
        // Given the following authority and deployed program.
        const client = await createTestClient();
        const authority = await generateKeyPairSignerWithSol(client);
        const [program, programData] = await createDeployedProgram(client, authority);

        // When we create a canonical metadata account with more data than the realloc limit.
        const largeData = getUtf8Encoder().encode('x'.repeat(2 * REALLOC_LIMIT + 4_520));
        await client.programMetadata.createMetadata({
            authority,
            program,
            programData,
            seed: 'idl',
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            data: largeData,
            singleExtendPerTransaction,
        });

        // Then we expect the following metadata account to be created.
        const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
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
            format: Format.Json,
            dataSource: DataSource.Direct,
            dataLength: largeData.length,
            data: largeData,
        });
    },
);

it('creates a canonical metadata account using an existing buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And an existing buffer with the following data.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data })
        .sendTransaction();

    // When we create a canonical metadata account using the existing buffer.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: buffer.address,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
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
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it.each([
    { singleExtendPerTransaction: false, label: 'densely packed extend instructions' },
    { singleExtendPerTransaction: true, label: 'a single extend instruction per transaction' },
])(
    'creates a canonical metadata account using an existing buffer as large as the realloc limit using $label',
    async ({ singleExtendPerTransaction }) => {
        // Given the following authority and deployed program.
        const client = await createTestClient();
        const authority = await generateKeyPairSignerWithSol(client);
        const [program, programData] = await createDeployedProgram(client, authority);

        // And an existing buffer holding exactly one realloc limit of data.
        const data = getUtf8Encoder().encode('x'.repeat(REALLOC_LIMIT));
        const buffer = await generateKeyPairSigner();
        await client.programMetadata.instructions
            .createBuffer({ newBuffer: buffer, authority: buffer, data })
            .sendTransactions();

        // When we create a canonical metadata account using the existing buffer.
        await client.programMetadata.createMetadata({
            authority,
            program,
            programData,
            seed: 'idl',
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            buffer: buffer.address,
            singleExtendPerTransaction,
        });

        // Then we expect the following metadata account to be created.
        const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
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
            format: Format.Json,
            dataSource: DataSource.Direct,
            dataLength: data.length,
            data,
        });
    },
);

it('creates a non-canonical metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // When we create a non-canonical metadata account for the program.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('creates a non-canonical metadata account with data larger than a transaction size', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // When we create a non-canonical metadata account for the program with a lot of data.
    const largeData = getUtf8Encoder().encode('x'.repeat(3_000));
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: largeData,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: largeData.length,
        data: largeData,
    });
});

it('creates a non-canonical metadata account using an existing buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And an existing buffer with the following data.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: buffer, authority: buffer, data })
        .sendTransaction();

    // When we create a non-canonical metadata account using the existing buffer.
    await client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: buffer.address,
    });

    // Then we expect the following metadata account to be created.
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        mutable: true,
        canonical: false,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        format: Format.Json,
        dataSource: DataSource.Direct,
        dataLength: data.length,
        data,
    });
});

it('cannot create a metadata account if no data or buffer is provided', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // When we try to create a metadata account without providing data or buffer.
    const promise = client.programMetadata.createMetadata({
        authority,
        program,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
    });

    // Then we expect the following error to be thrown.
    await expect(promise).rejects.toThrow(
        'Either `buffer` or `data` must be provided to create a new metadata account.',
    );
});

it('can close an existing buffer after using it to create a new metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And an existing buffer with the same authority.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions.createBuffer({ newBuffer: buffer, authority, data }).sendTransaction();

    // When we create a canonical metadata account
    // using the existing buffer and the `closeBuffer` option.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: buffer.address,
        closeBuffer: true,
    });

    // Then we expect the buffer account to no longer exist.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetchMaybe(buffer.address);
    expect(bufferAccount.exists).toBe(false);
});

it('accepts address wrappers for the program, program data, metadata, buffer and close destination', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });

    // And an existing buffer with the same authority.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    const buffer = await generateKeyPairSigner();
    await client.programMetadata.instructions.createBuffer({ newBuffer: buffer, authority, data }).sendTransaction();
    const bufferLamports = await getBalance(client, buffer.address);

    // And a recipient for the closed buffer's lamports.
    const recipient = (await generateKeyPairSigner()).address;

    // When we create a canonical metadata account passing every address as a wrapper.
    await client.programMetadata.createMetadata({
        authority,
        program: { address: program },
        programData: { address: programData },
        metadata: { address: metadata },
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        buffer: { address: buffer.address },
        closeBuffer: { address: recipient },
    });

    // Then we expect the metadata account to hold the buffer's data.
    const metadataAccount = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(metadataAccount.data.data).toStrictEqual(data);

    // And the buffer to be closed with its lamports sent to the wrapped recipient
    // rather than falling back to the payer.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetchMaybe(buffer.address);
    expect(bufferAccount.exists).toBe(false);
    expect(await getBalance(client, recipient)).toBe(bufferLamports);
});

it('resumes an interrupted create that left a pre-allocated buffer at the metadata PDA', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a fully written pre-allocated buffer
    // at the canonical metadata PDA, never initialized as a metadata account.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed: 'idl', data })
        .sendTransaction();

    // When we create the canonical metadata account with the same data.
    await client.programMetadata.createMetadata({
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

    // Then the pre-allocated buffer is initialized as the metadata account.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        canonical: true,
        seed: 'idl',
        dataLength: data.length,
        data,
    });
});

it('only transfers the missing rent when resuming an interrupted create', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create funded the canonical metadata PDA for its
    // final size and allocated it as a buffer, but never wrote any data to it.
    const data = getUtf8Encoder().encode('{"standard":"dummyIdl"}');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed: 'idl', dataLength: data.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const rent = client.svm.minimumBalanceForRentExemption(BigInt(getAccountSize(data.length)));
    expect(await getBalance(client, metadata)).toBe(rent);

    // When we create the canonical metadata account.
    await client.programMetadata.createMetadata({
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

    // Then the metadata account is initialized with the data.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });

    // And it holds exactly the rent it needs since no extra rent was transferred.
    expect(await getBalance(client, metadata)).toBe(rent);
});

it('extends a pre-allocated buffer by more than the realloc limit when resuming an interrupted create', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create only allocated an empty buffer at the
    // canonical metadata PDA.
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed: 'idl' })
        .sendTransaction();

    // And given a source buffer holding data larger than the realloc limit,
    // which a single `write` instruction cannot copy without a prior `extend`.
    const data: ReadonlyUint8Array = new Uint8Array(REALLOC_LIMIT * 2 + 100).fill(42);
    const sourceBuffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: sourceBuffer, authority: sourceBuffer, data })
        .sendTransactions();

    // When we create the canonical metadata account from the source buffer.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.None,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.None,
        buffer: sourceBuffer.address,
    });

    // Then the pre-allocated buffer is extended, written and initialized.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
    expect(await getBalance(client, metadata)).toBe(
        client.svm.minimumBalanceForRentExemption(BigInt(getAccountSize(data.length))),
    );
});

it('cannot create a metadata account that already exists', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following existing canonical metadata account.
    const input = {
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('{"standard":"dummyIdl"}'),
    };
    await client.programMetadata.createMetadata(input);

    // When we try to create it again, then we expect an error.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    await expect(client.programMetadata.createMetadata(input)).rejects.toThrow(
        `Metadata account ${metadata} already exists.`,
    );
});

it('cannot plan the creation of a metadata account that already exists', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following existing canonical metadata account.
    const input = {
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('{"standard":"dummyIdl"}'),
    };
    await client.programMetadata.createMetadata(input);

    // When we plan its creation from the fetched account, then we expect an error.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const metadataAccount = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    await expect(
        getCreateMetadataInstructionPlan(client, { ...input, payer: client.payer, metadata: metadataAccount }),
    ).rejects.toThrow(`Metadata account ${metadata} already exists.`);
});
