import { Address } from '@solana/kit';

import { Seed } from '../../generated';
import { decodeMaybeMetadataOrBuffer, fetchMetadataAndBuffer, isPreAllocatedBuffer } from '../../internals';
import { getWriteMetadataInstructionPlan } from '../../writeMetadata';
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

export function setWriteCommand(program: CustomCommand): void {
    program
        .command('write')
        .description('Create or update a metadata account for a given program.')
        .addArgument(seedArgument)
        .addArgument(programArgument)
        .addArgument(fileArgument)
        .tap(setWriteOptions)
        .addOption(nonCanonicalWriteOption)
        .action(doWrite);
}

type Options = WriteOptions & NonCanonicalWriteOption;
export async function doWrite(seed: Seed, program: Address, file: string | undefined, _: Options, cmd: CustomCommand) {
    const options = cmd.optsWithGlobals() as GlobalOptions & Options;
    const client = await getClient(options);
    const { metadata, programData } = await getPdaDetailsForWriting(client, options, program, seed);

    logCommand(`Writing metadata account...`, {
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
        getWriteMetadataInstructionPlan(client, {
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
