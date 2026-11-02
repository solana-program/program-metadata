import { Address } from '@solana/kit';

import { getCreateMetadataInstructionPlan } from '../../createMetadata';
import { Seed } from '../../generated';
import { decodeMaybeMetadataOrBuffer, fetchMetadataAndBuffer, isPreAllocatedBuffer } from '../../internals';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import { logCommand, logWarning } from '../logs';
import {
    GlobalOptions,
    nonCanonicalWriteOption,
    NonCanonicalWriteOption,
    setWriteOptions,
    WriteOptions,
} from '../options';
import { CustomCommand, getClient, getPdaDetailsForWriting, getWriteInput, INTERRUPTED_CREATE_WARNING } from '../utils';

export function setCreateCommand(program: CustomCommand): void {
    program
        .command('create')
        .description('Create a metadata account for a given program.')
        .addArgument(seedArgument)
        .addArgument(programArgument)
        .addArgument(fileArgument)
        .tap(setWriteOptions)
        .addOption(nonCanonicalWriteOption)
        .action(doCreate);
}

type Options = WriteOptions & NonCanonicalWriteOption;
export async function doCreate(seed: Seed, program: Address, file: string | undefined, _: Options, cmd: CustomCommand) {
    const options = cmd.optsWithGlobals() as GlobalOptions & Options;
    const client = await getClient(options);
    const { metadata, programData } = await getPdaDetailsForWriting(client, options, program, seed);

    logCommand(`Creating new metadata account...`, {
        metadata,
        program,
        seed,
        authority: client.identity.address,
    });

    const [encodedMetadata, buffer] = await fetchMetadataAndBuffer(client.rpc, metadata, options.buffer);
    const metadataAccount = decodeMaybeMetadataOrBuffer(encodedMetadata);
    const writeInput = getWriteInput(file, options, buffer);

    if (isPreAllocatedBuffer(metadataAccount)) {
        logWarning(INTERRUPTED_CREATE_WARNING);
    }

    await client.runOrExport(
        getCreateMetadataInstructionPlan(client, {
            ...writeInput,
            payer: client.payer,
            authority: client.identity,
            program,
            programData,
            seed,
            metadata: metadataAccount,
            singleExtendPerTransaction: options.singleExtendPerTx,
        }),
    );
}
