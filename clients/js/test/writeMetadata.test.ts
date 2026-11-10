import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
    address,
    flattenInstructionPlan,
    generateKeyPairSigner,
    getUtf8Encoder,
    isSolanaError,
    lamports,
    none,
    SingleInstructionPlan,
    SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND,
    some,
} from '@solana/kit';
import { expect, it } from 'vitest';

import {
    AccountDiscriminator,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    findNonCanonicalPda,
    Format,
    getWriteMetadataInstructionPlan,
    identifyProgramMetadataInstruction,
    Metadata,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
    ProgramMetadataInstruction,
    writeMetadata,
} from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('creates a new metadata account if it does not exist', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following canonical metadata account does not exist.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const initialAccount = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);
    expect(initialAccount.exists).toBe(false);

    // When we upload this canonical metadata account.
    const data = getUtf8Encoder().encode('Some data');
    await client.programMetadata.writeMetadata({
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

    // Then we expect the metadata account to be created.
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
        dataSource: DataSource.Direct,
        format: Format.Json,
        dataLength: data.length,
        data,
    });
});

it('updates a metadata account if it exists', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the following canonical metadata account exists.
    await client.programMetadata.createMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('OLD'),
    });

    // When we upload this canonical metadata account with different data.
    const newData = getUtf8Encoder().encode('NEW DATA WITH MORE BYTES');
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        data: newData,
    });

    // Then we expect the metadata account to be updated.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed: 'idl',
        encoding: Encoding.Base58,
        compression: Compression.Gzip,
        dataSource: DataSource.Url,
        format: Format.Toml,
        dataLength: newData.length,
        data: newData,
    });
});

it('initializes a pre-allocated buffer left at the metadata PDA by an interrupted create', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a fully written pre-allocated buffer
    // at the canonical metadata PDA, never initialized as a metadata account.
    const seed = 'idl';
    const data = getUtf8Encoder().encode('Interrupted create');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: data.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions.write({ buffer: metadata, authority, offset: 0, data }).sendTransaction();

    // When we upload the metadata account with the same data.
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is initialized as the metadata account.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: none(),
        mutable: true,
        canonical: true,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        dataLength: data.length,
        data,
    });
});

it('rewrites a pre-allocated buffer at the metadata PDA when the data changed', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a pre-allocated buffer with stale
    // data of the same length at the canonical metadata PDA.
    const seed = 'idl';
    const staleData = getUtf8Encoder().encode('STALE DATA');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: staleData.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: staleData })
        .sendTransaction();

    // When we upload the metadata account with new data of the same length.
    const data = getUtf8Encoder().encode('FRESH DATA');
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is rewritten and initialized as metadata.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
});

it('extends a pre-allocated buffer at the metadata PDA when the new data is larger', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a small pre-allocated buffer at the
    // canonical metadata PDA.
    const seed = 'idl';
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: 4 })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: getUtf8Encoder().encode('TINY') })
        .sendTransaction();

    // When we upload the metadata account with larger data.
    const data = getUtf8Encoder().encode('MUCH LARGER DATA');
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is grown, rewritten and initialized.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
});

it('rejects writes smaller than a pre-allocated buffer at the metadata PDA', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a large fully written pre-allocated
    // buffer at the canonical metadata PDA.
    const seed = 'idl';
    const staleData = getUtf8Encoder().encode('THIRTY-TWO BYTES OF STALE DATA');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: staleData.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: staleData })
        .sendTransaction();

    // When we upload the metadata account with smaller data, then it fails with
    // an actionable error instead of misreporting the account's data length.
    const data = getUtf8Encoder().encode('small');
    await expect(
        client.programMetadata.writeMetadata({
            authority,
            program,
            programData,
            seed,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            data,
        }),
    ).rejects.toThrow(/close-buffer/u);
});

it('rejects a resume that passes the metadata PDA itself as the buffer', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a fully written pre-allocated buffer
    // at the canonical metadata PDA.
    const seed = 'idl';
    const data = getUtf8Encoder().encode('Interrupted create');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: data.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions.write({ buffer: metadata, authority, offset: 0, data }).sendTransaction();

    // When we resume using the metadata PDA itself as the source buffer, then
    // it fails instead of initializing the account only to close it.
    await expect(
        client.programMetadata.writeMetadata({
            authority,
            program,
            programData,
            seed,
            buffer: metadata,
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            data,
        }),
    ).rejects.toThrow(/`buffer` must not be the metadata account/u);
});

it('resumes a pre-allocated buffer from a source buffer, preferring it over inline data', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a pre-allocated buffer with stale
    // data at the canonical metadata PDA.
    const seed = 'idl';
    const staleData = getUtf8Encoder().encode('STALE DATA!');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, dataLength: staleData.length })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    await client.programMetadata.instructions
        .write({ buffer: metadata, authority, offset: 0, data: staleData })
        .sendTransaction();

    // And given a source buffer holding the desired data.
    const desiredData = getUtf8Encoder().encode('FRESH DATA!');
    const sourceBuffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: sourceBuffer, authority: sourceBuffer, data: desiredData })
        .sendTransaction();

    // When we resume the create providing both the source buffer and inline
    // data of the same length.
    await client.programMetadata.writeMetadata({
        authority,
        program,
        programData,
        seed,
        buffer: sourceBuffer,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data: getUtf8Encoder().encode('INLINE DATA'),
    });

    // Then the metadata account is initialized with the source buffer's data,
    // matching the precedence of the create and update flows.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: desiredData.length,
        data: desiredData,
    });
});

it('initializes a pre-allocated buffer left at a non-canonical metadata PDA', async () => {
    // Given the following authority.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And given an interrupted create left a fully written pre-allocated buffer
    // at the non-canonical metadata PDA.
    const seed = 'idl';
    const data = getUtf8Encoder().encode('Interrupted create');
    await client.programMetadata.instructions
        .createNonCanonicalBuffer({ authority, program, seed, data })
        .sendTransaction();
    const [metadata] = await findNonCanonicalPda({ program, authority: authority.address, seed });

    // When we upload the metadata account with the same data.
    await client.programMetadata.writeMetadata({
        authority,
        program,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
    });

    // Then the pre-allocated buffer is initialized as the metadata account.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        program,
        authority: some(authority.address),
        canonical: false,
        seed,
        dataLength: data.length,
        data,
    });
});

it('resumes an interrupted create when the pre-allocated buffer was decoded as a metadata account', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a fully written pre-allocated buffer
    // at the canonical metadata PDA.
    const seed = 'idl';
    const data = getUtf8Encoder().encode('Interrupted create');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, data })
        .sendTransaction();

    // And given that account was fetched using the metadata decoder.
    const [metadata] = await findCanonicalPda({ program, seed });
    const metadataAccount = await client.programMetadata.accounts.metadata.fetchMaybe(metadata);

    // When we plan and send a write using that account.
    const plan = await getWriteMetadataInstructionPlan(client, {
        payer: client.payer,
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
        metadata: metadataAccount,
    });
    await client.sendTransactions(plan);

    // Then the pre-allocated buffer is initialized as the metadata account.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
});

it('creates a metadata account at a PDA that was only funded', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the canonical metadata PDA was funded but never allocated.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    client.svm.setAccount({
        address: metadata,
        data: new Uint8Array(0),
        executable: false,
        lamports: lamports(1_000_000n),
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        space: 0n,
    });

    // When we upload the canonical metadata account.
    const data = getUtf8Encoder().encode('Some data');
    await client.programMetadata.writeMetadata({
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

    // Then we expect the metadata account to be created.
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{
        discriminator: AccountDiscriminator.Metadata,
        dataLength: data.length,
        data,
    });
});

it('rejects a metadata PDA holding an unexpected discriminator', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the canonical metadata PDA holds a zeroed program-owned account.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    client.svm.setAccount({
        address: metadata,
        data: new Uint8Array(96),
        executable: false,
        lamports: lamports(client.svm.minimumBalanceForRentExemption(96n)),
        programAddress: PROGRAM_METADATA_PROGRAM_ADDRESS,
        space: 96n,
    });

    // When we upload the canonical metadata account, then we expect an error.
    await expect(
        client.programMetadata.writeMetadata({
            authority,
            program,
            programData,
            seed: 'idl',
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            data: getUtf8Encoder().encode('Some data'),
        }),
    ).rejects.toThrow(`The account at ${metadata} has an unexpected discriminator (0)`);
});

it('only plans an initialize instruction when the pre-allocated buffer already holds the data', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given an interrupted create left a fully written and funded
    // pre-allocated buffer at the canonical metadata PDA.
    const seed = 'idl';
    const data = getUtf8Encoder().encode('Interrupted create');
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority, program, programData, seed, data })
        .sendTransaction();
    const [metadata] = await findCanonicalPda({ program, seed });
    const metadataAccount = await client.programMetadata.accounts.buffer.fetch(metadata);

    // When we plan a write with the same data.
    const plan = await getWriteMetadataInstructionPlan(client, {
        payer: client.payer,
        authority,
        program,
        programData,
        seed,
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        data,
        metadata: metadataAccount,
    });

    // Then the plan only consists of the `initialize` instruction.
    const leaves = flattenInstructionPlan(plan);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ kind: 'single' });
    const [leaf] = leaves as [SingleInstructionPlan];
    expect(identifyProgramMetadataInstruction(leaf.instruction.data!)).toBe(ProgramMetadataInstruction.Initialize);
});

it('fetches the metadata and buffer accounts using a single RPC request', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given a source buffer holding the data to write.
    const data = getUtf8Encoder().encode('Some data');
    const sourceBuffer = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .createBuffer({ newBuffer: sourceBuffer, authority: sourceBuffer, data })
        .sendTransaction();

    // And given an RPC that records the methods it is called with.
    const calledMethods: string[] = [];
    const rpc = new Proxy(client.rpc, {
        get(target, property, receiver) {
            calledMethods.push(String(property));
            return Reflect.get(target, property, receiver) as unknown;
        },
    });

    // When we write the metadata account from the source buffer.
    await writeMetadata(
        { ...client, rpc },
        {
            payer: client.payer,
            authority,
            program,
            programData,
            seed: 'idl',
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            buffer: sourceBuffer.address,
        },
    );

    // Then both accounts were fetched using a single `getMultipleAccounts` request.
    expect(calledMethods).toEqual(['getMultipleAccounts']);

    // And the metadata account was created from the source buffer.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data).toMatchObject(<Metadata>{ dataLength: data.length, data });
});

it('cannot write a metadata account from a buffer that does not exist', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // When we write the metadata account from a missing buffer, then we expect an error.
    const missingBuffer = await generateKeyPairSigner();
    await expect(
        client.programMetadata.writeMetadata({
            authority,
            program,
            programData,
            seed: 'idl',
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            buffer: missingBuffer.address,
        }),
    ).rejects.toSatisfy(error => isSolanaError(error, SOLANA_ERROR__ACCOUNTS__ACCOUNT_NOT_FOUND));
});

it('rejects a metadata PDA owned by another program', async () => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And given the canonical metadata PDA holds an account owned by another program.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const owner = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    client.svm.setAccount({
        address: metadata,
        data: new Uint8Array(96),
        executable: false,
        lamports: lamports(client.svm.minimumBalanceForRentExemption(96n)),
        programAddress: owner,
        space: 96n,
    });

    // When we upload the canonical metadata account, then we expect an error.
    await expect(
        client.programMetadata.writeMetadata({
            authority,
            program,
            programData,
            seed: 'idl',
            encoding: Encoding.Utf8,
            compression: Compression.None,
            dataSource: DataSource.Direct,
            format: Format.Json,
            data: getUtf8Encoder().encode('Some data'),
        }),
    ).rejects.toThrow(`The account at ${metadata} is owned by ${owner}`);
});
