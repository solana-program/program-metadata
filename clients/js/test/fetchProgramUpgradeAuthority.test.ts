import { readFileSync } from 'node:fs';

import { generateKeyPairSigner, getProgramDerivedAddress } from '@solana/kit';
import { expect, it } from 'vitest';

import { fetchProgramUpgradeAuthority, LOADER_V2_PROGRAM_ADDRESS } from '../src';
import {
    createDeployedProgram,
    createNativeProgram,
    createTestClient,
    generateKeyPairSignerWithSol,
    PROGRAM_METADATA_BINARY_PATH,
} from './_setup';

it('reports a keypair upgrade authority and the last deployed slot', async () => {
    // Given a loader-v3 program upgradeable by a keypair and deployed at slot 123,456.
    const client = await createTestClient();
    const authority = await generateKeyPairSigner();
    const [program, programData] = await createDeployedProgram(client, authority, 123_456n);

    // When we fetch its upgrade authority.
    const result = await fetchProgramUpgradeAuthority(client.rpc, program);

    // Then we expect the keypair authority and deploy slot to be returned.
    expect(result).toStrictEqual({
        authority: authority.address,
        authorityKind: 'keypair',
        lastDeployedSlot: 123_456n,
        loader: 'v3',
        program,
        programData,
    });
});

it('reports a PDA upgrade authority', async () => {
    // Given a loader-v3 program upgradeable by a PDA, e.g. a multisig vault.
    const client = await createTestClient();
    const [vault] = await getProgramDerivedAddress({
        programAddress: (await generateKeyPairSigner()).address,
        seeds: ['vault'],
    });
    const [program] = await createDeployedProgram(client, vault);

    // When we fetch its upgrade authority.
    const result = await fetchProgramUpgradeAuthority(client.rpc, program);

    // Then we expect the authority to be flagged as a PDA.
    expect(result).toMatchObject({ authority: vault, authorityKind: 'pda' });
});

it('reports a loader-v3 program made immutable', async () => {
    // Given a loader-v3 program whose upgrade authority was removed.
    const client = await createTestClient();
    const [program, programData] = await createDeployedProgram(client, null, 42n);

    // When we fetch its upgrade authority.
    const result = await fetchProgramUpgradeAuthority(client.rpc, program);

    // Then we expect no authority to be returned.
    expect(result).toStrictEqual({
        authority: null,
        authorityKind: 'none',
        lastDeployedSlot: 42n,
        loader: 'v3',
        program,
        programData,
    });
});

it('reports a loader-v2 program as immutable', async () => {
    // Given a program deployed with loader v2.
    const client = await createTestClient();
    const program = (await generateKeyPairSigner()).address;
    client.svm.addProgramWithLoader(program, readFileSync(PROGRAM_METADATA_BINARY_PATH), LOADER_V2_PROGRAM_ADDRESS);

    // When we fetch its upgrade authority.
    const result = await fetchProgramUpgradeAuthority(client.rpc, program);

    // Then we expect it to be reported as immutable.
    expect(result).toStrictEqual({
        authority: null,
        authorityKind: 'none',
        loader: 'v2',
        program,
    });
});

it('fails for missing accounts', async () => {
    // Given an address with no account.
    const client = await createTestClient();
    const missing = (await generateKeyPairSigner()).address;

    // When we try to fetch its upgrade authority.
    const promise = fetchProgramUpgradeAuthority(client.rpc, missing);

    // Then we expect an error to be thrown.
    await expect(promise).rejects.toThrow();
});

it('fails for non-executable accounts', async () => {
    // Given a plain, non-executable wallet account.
    const client = await createTestClient();
    const wallet = await generateKeyPairSignerWithSol(client);

    // When we try to fetch its upgrade authority.
    const promise = fetchProgramUpgradeAuthority(client.rpc, wallet);

    // Then we expect an error to be thrown.
    await expect(promise).rejects.toThrow('Program account must be executable');
});

it('fails for programs not owned by loader v2 or v3', async () => {
    // Given a native program.
    const client = await createTestClient();
    const program = await createNativeProgram(client);

    // When we try to fetch its upgrade authority.
    const promise = fetchProgramUpgradeAuthority(client.rpc, program);

    // Then we expect an error to be thrown.
    await expect(promise).rejects.toThrow('Invalid loader program, expected loader v2 or v3');
});
