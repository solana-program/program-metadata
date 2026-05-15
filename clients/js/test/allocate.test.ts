import { address, generateKeyPairSigner, none, some } from '@solana/kit';
import test from 'ava';
import { ACCOUNT_HEADER_LENGTH, AccountDiscriminator, Buffer, findCanonicalPda, findNonCanonicalPda } from '../src';
import { createDeployedProgram, createTestClient, generateKeyPairSignerWithSol } from './_setup';

test('it allocates a canonical PDA buffer', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);

    // And the following seed derivation for the buffer.
    const seed = 'dummy';
    const [buffer] = await findCanonicalPda({ program, seed });

    // When we allocate the buffer account for a canonical PDA.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: buffer,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH),
        }),
        client.programMetadata.instructions.allocate({ buffer, authority, program, programData, seed }),
    ]);

    // Then we expect the following buffer account to be created.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer);
    t.like(bufferAccount.data, <Buffer>{
        discriminator: AccountDiscriminator.Buffer,
        program: some(program),
        authority: some(authority.address),
        canonical: true,
        seed,
        data: new Uint8Array([]),
    });
});

test('it allocates a non-canonical PDA buffer', async t => {
    // Given the following authority and deployed program.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

    // And the following seed derivation for the buffer.
    const seed = 'dummy';
    const [buffer] = await findNonCanonicalPda({ program, authority: authority.address, seed });

    // When we allocate the buffer account for a canonical PDA.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: authority,
            destination: buffer,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH),
        }),
        client.programMetadata.instructions.allocate({ buffer, authority, program, seed }),
    ]);

    // Then we expect the following buffer account to be created.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer);
    t.like(bufferAccount.data, <Buffer>{
        discriminator: AccountDiscriminator.Buffer,
        program: some(program),
        authority: some(authority.address),
        canonical: false,
        seed,
        data: new Uint8Array([]),
    });
});

test('it allocates a keypair buffer', async t => {
    // Given the following payer and buffer keypairs.
    const client = await createTestClient();
    const [payer, buffer] = await Promise.all([generateKeyPairSignerWithSol(client), generateKeyPairSigner()]);

    // When we allocate the buffer account for a canonical PDA.
    await client.sendTransaction([
        client.system.instructions.transferSol({
            source: payer,
            destination: buffer.address,
            amount: await client.getMinimumBalance(ACCOUNT_HEADER_LENGTH),
        }),
        client.programMetadata.instructions.allocate({ buffer: buffer.address, authority: buffer }),
    ]);

    // Then we expect the following buffer account to be created.
    const bufferAccount = await client.programMetadata.accounts.buffer.fetch(buffer.address);
    t.like(bufferAccount.data, <Buffer>{
        discriminator: AccountDiscriminator.Buffer,
        program: none(),
        authority: some(buffer.address),
        canonical: false,
        seed: '',
        data: new Uint8Array([]),
    });
});
