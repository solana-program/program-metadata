import path from 'node:path';

import { systemProgram } from '@solana-program/system';
import {
    Address,
    createClient,
    generateKeyPairSigner,
    getAddressEncoder,
    getOptionEncoder,
    getStructEncoder,
    getU32Encoder,
    getU64Encoder,
    KeyPairSigner,
    lamports,
    Lamports,
    sol,
    solToLamports,
    some,
} from '@solana/kit';
import { litesvm } from '@solana/kit-plugin-litesvm';
import { airdropSigner, generatedSigner } from '@solana/kit-plugin-signer';

import {
    getProgramDataPda as getLoaderV3ProgramDataPda,
    LOADER_V3_PROGRAM_ADDRESS,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
    programMetadataProgram,
} from '../src';

export const REALLOC_LIMIT = 10_240;

const PROGRAM_METADATA_BINARY_PATH = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'target',
    'deploy',
    'spl_program_metadata.so',
);

export const createTestClient = () => {
    return createClient()
        .use(generatedSigner())
        .use(litesvm())
        .use(airdropSigner(solToLamports(sol('1'))))
        .use(systemProgram())
        .use(client => {
            // Load the program-metadata program into the LiteSVM instance from
            // its compiled `.so` file. This must run after the `litesvm()`
            // plugin so that `client.svm` is available.
            client.svm.addProgramFromFile(PROGRAM_METADATA_PROGRAM_ADDRESS, PROGRAM_METADATA_BINARY_PATH);
            return client;
        })
        .use(programMetadataProgram());
};

export type TestClient = Awaited<ReturnType<typeof createTestClient>>;

export const generateKeyPairSignerWithSol = async (
    client: TestClient,
    putativeLamports: bigint = 1_000_000_000n,
): Promise<KeyPairSigner> => {
    const signer = await generateKeyPairSigner();
    await client.airdrop(signer.address, putativeLamports as Lamports);
    return signer;
};

export const getBalance = async (client: TestClient, address: Address) =>
    (await client.rpc.getBalance(address, { commitment: 'confirmed' }).send()).value;

/**
 * Encoders mirroring the on-chain loader-v3 account layouts. See
 * {@link getProgramAuthority} in `src/utils.ts` for the corresponding
 * decoders.
 */
const getLoaderV3ProgramAccountEncoder = () =>
    getStructEncoder([
        ['discriminator', getU32Encoder()],
        ['programData', getAddressEncoder()],
    ]);

const getLoaderV3ProgramDataAccountEncoder = () =>
    getStructEncoder([
        ['discriminator', getU32Encoder()],
        ['slot', getU64Encoder()],
        ['authority', getOptionEncoder(getAddressEncoder())],
    ]);

/**
 * Fabricates a "deployed" loader-v3 program inside the LiteSVM instance by
 * writing the `program` and `programData` accounts directly. The deployed
 * program is never actually invoked — only its account data is read by the
 * program-metadata program for the canonicity check.
 */
export const createDeployedProgram = async (
    client: TestClient,
    authority: KeyPairSigner,
): Promise<[Address, Address]> => {
    const program = await generateKeyPairSigner();
    const [programData] = await getLoaderV3ProgramDataPda(program.address);

    const programAccountData = getLoaderV3ProgramAccountEncoder().encode({
        discriminator: 2,
        programData,
    });
    const programDataAccountData = getLoaderV3ProgramDataAccountEncoder().encode({
        discriminator: 3,
        slot: 0n,
        authority: some(authority.address),
    });

    const programSpace = BigInt(programAccountData.length);
    const programDataSpace = BigInt(programDataAccountData.length);

    client.svm.setAccount({
        address: program.address,
        data: programAccountData,
        executable: true,
        lamports: lamports(client.svm.minimumBalanceForRentExemption(programSpace)),
        programAddress: LOADER_V3_PROGRAM_ADDRESS,
        space: programSpace,
    });

    client.svm.setAccount({
        address: programData,
        data: programDataAccountData,
        executable: false,
        lamports: lamports(client.svm.minimumBalanceForRentExemption(programDataSpace)),
        programAddress: LOADER_V3_PROGRAM_ADDRESS,
        space: programDataSpace,
    });

    return [program.address, programData];
};
