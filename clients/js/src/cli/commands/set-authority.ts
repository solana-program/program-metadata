import { Address } from '@solana/kit';

import { Seed } from '../../generated';
import { programArgument, seedArgument } from '../arguments';
import { logCommand } from '../logs';
import { GlobalOptions, NewAuthorityOption, newAuthorityOption } from '../options';
import { CustomCommand, getClient, getPdaDetails } from '../utils';

export function setSetAuthorityCommand(program: CustomCommand): void {
    program
        .command('set-authority')
        .description('Set or update an additional authority on canonical metadata accounts.')
        .addArgument(seedArgument)
        .addArgument(programArgument)
        .addOption(newAuthorityOption)
        .action(doSetAuthority);
}

type Options = NewAuthorityOption;
async function doSetAuthority(seed: Seed, program: Address, _: Options, cmd: CustomCommand) {
    const options = cmd.optsWithGlobals() as GlobalOptions & Options;
    const client = await getClient(options);
    const { metadata, programData } = await getPdaDetails({
        rpc: client.rpc,
        authority: client.identity,
        program,
        seed,
    });

    logCommand(`Setting additional authority from metadata account...`, {
        'new authority': options.newAuthority,
        metadata,
        program,
        seed,
    });

    await client.runOrExport(
        client.programMetadata.instructions.setAuthority({
            account: metadata,
            authority: client.identity,
            newAuthority: options.newAuthority,
            program,
            programData,
        }),
    );
}
