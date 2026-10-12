import { generateKeyPairSigner, none, some } from '@solana/kit';
import { expect, it } from 'vitest';

import { findCanonicalPda } from '../src';
import { getCanonicalPdaDetails } from '../src/cli/utils';
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

    // When the program authority resolves the canonical metadata account.
    const details = await getCanonicalPdaDetails({ rpc: client.rpc, identity: authority }, program, 'idl');

    // Then we expect the canonical metadata account.
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    expect(details).toStrictEqual({ programData, metadata, isCanonical: true });
});

it('lets the additional authority hand the canonical metadata account over to another authority', async () => {
    // Given an existing canonical metadata account with the following additional authority.
    const client = await createTestClient();
    const { additionalAuthority, metadata, program, programData } = await createCanonicalMetadataWithAuthority(client);

    // When the additional authority resolves the canonical metadata account.
    const details = await getCanonicalPdaDetails({ rpc: client.rpc, identity: additionalAuthority }, program, 'idl');

    // Then we expect the canonical metadata account.
    expect(details).toStrictEqual({ programData, metadata, isCanonical: true });

    // And we expect the program to accept a new authority set by the additional authority.
    const newAuthority = await generateKeyPairSigner();
    await client.programMetadata.instructions
        .setAuthority({
            account: details.metadata,
            authority: additionalAuthority,
            newAuthority: newAuthority.address,
            program,
            programData: details.programData,
        })
        .sendTransaction();
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toStrictEqual(some(newAuthority.address));
});

it('lets the additional authority remove itself from the canonical metadata account', async () => {
    // Given an existing canonical metadata account with the following additional authority.
    const client = await createTestClient();
    const { additionalAuthority, metadata, program } = await createCanonicalMetadataWithAuthority(client);

    // When the additional authority resolves the canonical metadata account.
    const details = await getCanonicalPdaDetails({ rpc: client.rpc, identity: additionalAuthority }, program, 'idl');

    // Then we expect the program to accept the removal of the additional authority.
    await client.programMetadata.instructions
        .setAuthority({
            account: details.metadata,
            authority: additionalAuthority,
            newAuthority: null,
            program,
            programData: details.programData,
        })
        .sendTransaction();
    const account = await client.programMetadata.accounts.metadata.fetch(metadata);
    expect(account.data.authority).toStrictEqual(none());
});

it('rejects a third party when the canonical metadata account does not exist', async () => {
    // Given a program deployed with loader v3 and a third-party authority.
    const client = await createTestClient();
    const programAuthority = await generateKeyPairSignerWithSol(client);
    const authority = await generateKeyPairSignerWithSol(client);
    const [program] = await createDeployedProgram(client, programAuthority);

    // When the third party resolves the canonical metadata account.
    const promise = getCanonicalPdaDetails({ rpc: client.rpc, identity: authority }, program, 'idl');

    // Then we expect an error since only the upgrade authority can create canonical metadata accounts.
    await expect(promise).rejects.toThrow('You must be the program upgrade authority');
});

it('rejects a third party when the canonical metadata account has a different additional authority', async () => {
    // Given an existing canonical metadata account with an additional authority.
    const client = await createTestClient();
    const { program } = await createCanonicalMetadataWithAuthority(client);

    // When another third party resolves the canonical metadata account.
    const authority = await generateKeyPairSignerWithSol(client);
    const promise = getCanonicalPdaDetails({ rpc: client.rpc, identity: authority }, program, 'idl');

    // Then we expect an error.
    await expect(promise).rejects.toThrow('You must be the program upgrade authority');
});

it('rejects a former additional authority once it has been removed', async () => {
    // Given an existing canonical metadata account with an additional authority.
    const client = await createTestClient();
    const { additionalAuthority, metadata, program, programAuthority, programData } =
        await createCanonicalMetadataWithAuthority(client);

    // And given the program authority removed that additional authority.
    await client.programMetadata.instructions
        .setAuthority({ account: metadata, authority: programAuthority, newAuthority: null, program, programData })
        .sendTransaction();

    // When the former additional authority resolves the canonical metadata account.
    const promise = getCanonicalPdaDetails({ rpc: client.rpc, identity: additionalAuthority }, program, 'idl');

    // Then we expect an error.
    await expect(promise).rejects.toThrow('You must be the program upgrade authority');
});

it('rejects the authority of a canonical buffer account', async () => {
    // Given a program deployed with loader v3 and the following upgrade authority.
    const client = await createTestClient();
    const [programAuthority, bufferAuthority] = await Promise.all([
        generateKeyPairSignerWithSol(client),
        generateKeyPairSignerWithSol(client),
    ]);
    const [program, programData] = await createDeployedProgram(client, programAuthority);

    // And a pre-allocated canonical buffer whose authority was handed over to another signer.
    await client.programMetadata.instructions
        .createCanonicalBuffer({ authority: programAuthority, program, programData, seed: 'idl', dataLength: 10 })
        .sendTransaction();
    const [buffer] = await findCanonicalPda({ program, seed: 'idl' });
    await client.programMetadata.instructions
        .setAuthority({
            account: buffer,
            authority: programAuthority,
            newAuthority: bufferAuthority.address,
            program,
            programData,
        })
        .sendTransaction();

    // When the buffer authority resolves the canonical metadata account.
    const promise = getCanonicalPdaDetails({ rpc: client.rpc, identity: bufferAuthority }, program, 'idl');

    // Then we expect an error since only the upgrade authority can initialize canonical metadata accounts.
    await expect(promise).rejects.toThrow('You must be the program upgrade authority');
});
