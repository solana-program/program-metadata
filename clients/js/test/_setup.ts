import { systemProgram } from '@solana-program/system';
import {
    Address,
    createClient,
    generateKeyPairSigner,
    getBase64Encoder,
    KeyPairSigner,
    Lamports,
    sol,
    solToLamports,
} from '@solana/kit';
import { solanaLocalRpc } from '@solana/kit-plugin-rpc';
import { airdropSigner, generatedSigner } from '@solana/kit-plugin-signer';

import {
    getProgramDataPda as getLoaderV3ProgramDataPda,
    LOADER_V3_PROGRAM_ADDRESS,
    programMetadataProgram,
} from '../src';
import { getDeployWithMaxDataLenInstruction as getLoaderV3DeployInstruction } from './loader-v3/deploy';
import { getInitializeBufferInstruction as getLoaderV3InitializeBufferInstruction } from './loader-v3/initializeBuffer';
import { getWriteInstruction as getLoaderV3WriteInstruction } from './loader-v3/write';

export const REALLOC_LIMIT = 10_240;

const SMALLER_VALID_PROGRAM_BINARY =
    'f0VMRgIBAQAAAAAAAAAAAAMA9wABAAAA6AAAAAAAAABAAAAAAAAAAMgBAAAAAAAAAAAAAEAAOAADAEAABgAFAAEAAAAFAAAA6AAAAAAAAADoAAAAAAAAAOgAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAAQAAAAAAAAAQAAAAQAAABgAQAAAAAAAGABAAAAAAAAYAEAAAAAAAA8AAAAAAAAADwAAAAAAAAAABAAAAAAAAACAAAABgAAAPAAAAAAAAAA8AAAAAAAAADwAAAAAAAAAHAAAAAAAAAAcAAAAAAAAAAIAAAAAAAAAJUAAAAAAAAAHgAAAAAAAAAEAAAAAAAAAAYAAAAAAAAAYAEAAAAAAAALAAAAAAAAABgAAAAAAAAABQAAAAAAAACQAQAAAAAAAAoAAAAAAAAADAAAAAAAAAAWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAQAAEA6AAAAAAAAAAAAAAAAAAAAABlbnRyeXBvaW50AAAudGV4dAAuZHluYW1pYwAuZHluc3ltAC5keW5zdHIALnNoc3RydGFiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAABAAAABgAAAAAAAADoAAAAAAAAAOgAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAHAAAABgAAAAMAAAAAAAAA8AAAAAAAAADwAAAAAAAAAHAAAAAAAAAABAAAAAAAAAAIAAAAAAAAABAAAAAAAAAAEAAAAAsAAAACAAAAAAAAAGABAAAAAAAAYAEAAAAAAAAwAAAAAAAAAAQAAAABAAAACAAAAAAAAAAYAAAAAAAAABgAAAADAAAAAgAAAAAAAACQAQAAAAAAAJABAAAAAAAADAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAgAAAAAwAAAAAAAAAAAAAAAAAAAAAAAACcAQAAAAAAACoAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAA';

export const createTestClient = () => {
    return createClient()
        .use(generatedSigner())
        .use(solanaLocalRpc())
        .use(airdropSigner(solToLamports(sol('1'))))
        .use(systemProgram())
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

export const createDeployedProgram = async (
    client: TestClient,
    authority: KeyPairSigner,
    payer?: KeyPairSigner,
): Promise<[Address, Address]> => {
    // Prepare all inputs.
    payer = payer ?? authority;
    const data = getBase64Encoder().encode(SMALLER_VALID_PROGRAM_BINARY);
    const dataSize = BigInt(37 + data.length);
    const programSize = 36n;
    const [buffer, program, dataRent, programRent] = await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        client.getMinimumBalance(Number(dataSize)),
        client.getMinimumBalance(Number(programSize)),
    ]);
    const [programData] = await getLoaderV3ProgramDataPda(program.address);

    // Create the buffer, write the program binary to it, create the program
    // account and deploy the program from the buffer.
    await client.sendTransactions([
        client.system.instructions.createAccount({
            payer,
            newAccount: buffer,
            lamports: dataRent,
            space: dataSize,
            programAddress: LOADER_V3_PROGRAM_ADDRESS,
        }),
        getLoaderV3InitializeBufferInstruction({
            sourceAccount: buffer.address,
            bufferAuthority: authority.address,
        }),
        getLoaderV3WriteInstruction({
            bufferAccount: buffer.address,
            bufferAuthority: authority,
            offset: 0,
            bytes: data,
        }),
        client.system.instructions.createAccount({
            payer,
            newAccount: program,
            lamports: programRent,
            space: programSize,
            programAddress: LOADER_V3_PROGRAM_ADDRESS,
        }),
        getLoaderV3DeployInstruction({
            payerAccount: payer,
            programDataAccount: programData,
            programAccount: program.address,
            bufferAccount: buffer.address,
            authority,
            maxDataLen: data.length,
        }),
    ]);

    return [program.address, programData];
};
