import { Address } from '@solana/kit';
import picocolors from 'picocolors';

import { decodeMetadata, Seed } from '../../generated';
import { fetchMetadataAndBuffer } from '../../internals';
import { getUpdateMetadataInstructionPlan } from '../../updateMetadata';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import { logCommand, logErrorAndExit } from '../logs';
import {
    GlobalOptions,
    nonCanonicalWriteOption,
    NonCanonicalWriteOption,
    setWriteOptions,
    WriteOptions,
} from '../options';
import { CustomCommand, getClient, getPdaDetailsForWriting, getWriteInput } from '../utils';

export function setUpdateCommand(program: CustomCommand): void {
    program
        .command('update')
        .description('Update a metadata account for a given program.')
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

    logCommand(`Updating metadata account...`, {
        metadata,
        program,
        seed,
        authority: client.identity.address,
    });

    const [encodedMetadata, buffer] = await fetchMetadataAndBuffer(client.rpc, metadata, options.buffer);
    const metadataAccount = decodeMetadata(encodedMetadata);
    const writeInput = getWriteInput(file, options, buffer);

    if (!metadataAccount.exists) {
        logErrorAndExit(`Metadata account ${picocolors.bold(metadataAccount.address)} does not exist.`);
    }

    await client.runOrExport(
        getUpdateMetadataInstructionPlan(client, {
            ...writeInput,
            payer: client.payer,
            authority: client.identity,
            program,
            programData,
            metadata: metadataAccount,
            singleExtendPerTransaction: options.singleExtendPerTx,
        }),
    );
}
