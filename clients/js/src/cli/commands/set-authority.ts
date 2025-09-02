import { Address, sequentialInstructionPlan } from '@solana/kit';
import { getSetAuthorityInstruction, Seed } from '../../generated';
import { getPdaDetails } from '../../internals';
import { programArgument, seedArgument } from '../arguments';
import { logCommand } from '../logs';
import {
  GlobalOptions,
  NewAuthorityOption,
  newAuthorityOption,
} from '../options';
import { CustomCommand, getClient } from '../utils';

export function setSetAuthorityCommand(program: CustomCommand): void {
  program
    .command('set-authority')
    .description(
      'Set or update an additional authority on canonical metadata accounts.'
    )
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addOption(newAuthorityOption)
    .action(doSetAuthority);
}

type Options = NewAuthorityOption;
async function doSetAuthority(
  seed: Seed,
  program: Address,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const { metadata, programData } = await getPdaDetails({
    ...client,
    program,
    seed,
  });

  logCommand(`Setting additional authority from metadata account...`, {
    'new authority': options.newAuthority,
    metadata,
    program,
    seed,
  });

  await client.planAndExecute(
    sequentialInstructionPlan([
      getSetAuthorityInstruction({
        account: metadata,
        authority: client.authority,
        newAuthority: options.newAuthority,
        program,
        programData,
      }),
    ])
  );
}
