import { address, Address } from '@solana/kit';
import chalk from 'chalk';
import { getSetAuthorityInstruction, Seed } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { getPdaDetails } from '../../internals';
import { programArgument, seedArgument } from '../arguments';
import { logSuccess } from '../logs';
import { GlobalOptions } from '../options';
import { CustomCommand, getClient } from '../utils';

export function setSetAuthorityCommand(program: CustomCommand): void {
  program
    .command('set-authority')
    .description(
      'Set or update an additional authority on canonical metadata accounts.'
    )
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .argument('<new-authority>', 'The new authority to set', address) // TODO: Make it a mandatory option to be explicit.
    .action(doSetAuthority);
}

type Options = {};
async function doSetAuthority(
  seed: Seed,
  program: Address,
  newAuthority: Address,
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
  await client.planAndExecute(
    sequentialInstructionPlan([
      getSetAuthorityInstruction({
        account: metadata,
        authority: client.authority,
        newAuthority: address(newAuthority),
        program,
        programData,
      }),
    ])
  );
  logSuccess(
    `Additional authority successfully set to ${chalk.bold(newAuthority)}`
  );
}
