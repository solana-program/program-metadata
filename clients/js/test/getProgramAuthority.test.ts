import { generateKeyPairSigner } from '@solana/kit';
import { expect, it } from 'vitest';

import { getProgramAuthority } from '../src';
import { createDeployedProgram, createNativeProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

it('resolves the upgrade authority of a loader-v3 program', async () => {
    // Given a program deployed with loader v3 and the following upgrade authority.
    const client = await createTestClient();
    const authority = await generateKeyPairSigner();
    const [program, programData] = await createDeployedProgram(client, authority);

    // When we get the program authority.
    const result = await getProgramAuthority(client.rpc, program);

    // Then we expect the upgrade authority and the program data account to be returned.
    expect(result).toStrictEqual({ authority: authority.address, programData });
});

it('resolves the program itself as the authority of a native program', async () => {
    // Given a native program — i.e. an executable account owned by the native loader.
    const client = await createTestClient();
    const program = await createNativeProgram(client);

    // When we get the program authority.
    const result = await getProgramAuthority(client.rpc, program);

    // Then we expect the program's own address to be returned as the authority,
    // mirroring the on-chain rule for programs not owned by loader v3.
    expect(result).toStrictEqual({ authority: program });
});

it('fails for non-executable accounts', async () => {
    // Given a plain, non-executable wallet account.
    const client = await createTestClient();
    const wallet = await generateKeyPairSignerWithSol(client);

    // When we try to get its program authority.
    const promise = getProgramAuthority(client.rpc, wallet.address);

    // Then we expect an error to be thrown.
    await expect(promise).rejects.toThrow('Program account must be executable');
});
