import { Address, sequentialInstructionPlan } from '@solana/kit';
import { getSetAuthorityInstruction, Seed } from '../../generated';
import { getPdaDetails } from '../../internals';
import { programArgument, seedArgument } from '../arguments';
import { GlobalOptions } from '../options';
import { CustomCommand, getClient } from '../utils';
import { logCommand } from '../logs';

export function setRemoveAuthorityCommand(program: CustomCommand): void {
  program
    .command('remove-authority')
    .description(
      'Remove the additional authority on canonical metadata accounts.'
    )
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .action(doRemoveAuthority);
}

type Options = {};
async function doRemoveAuthority(
  seed: Seed,
  program: Address,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const { metadata, programData } = await getPdaDetails({
    rpc: client.rpc,
    program,
    authority: client.authority,
    seed,
  });

  logCommand(`Removing additional authority from metadata account...`, {
    metadata,
    program,
    seed,
  });

  await client.planAndExecute(
    sequentialInstructionPlan([
      getSetAuthorityInstruction({
        account: metadata,
        authority: client.authority,
        newAuthority: null,
        program,
        programData,
      }),
    ])
  );
}
