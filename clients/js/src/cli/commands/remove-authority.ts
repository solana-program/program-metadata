import { Address } from '@solana/kit';
import { Seed } from '../../generated';
import { programArgument, seedArgument } from '../arguments';
import { GlobalOptions } from '../options';
import { CustomCommand, getClient, getPdaDetails } from '../utils';
import { logCommand } from '../logs';

export function setRemoveAuthorityCommand(program: CustomCommand): void {
    program
        .command('remove-authority')
        .description('Remove the additional authority on canonical metadata accounts.')
        .addArgument(seedArgument)
        .addArgument(programArgument)
        .action(doRemoveAuthority);
}

type Options = {};
async function doRemoveAuthority(seed: Seed, program: Address, _: Options, cmd: CustomCommand) {
    const options = cmd.optsWithGlobals() as GlobalOptions & Options;
    const client = await getClient(options);
    const { metadata, programData } = await getPdaDetails({
        rpc: client.rpc,
        program,
        authority: client.identity,
        seed,
    });

    logCommand(`Removing additional authority from metadata account...`, {
        metadata,
        program,
        seed,
    });

    await client.runOrExport(
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority: client.identity,
            newAuthority: null,
            program,
            programData,
        }),
    );
}
