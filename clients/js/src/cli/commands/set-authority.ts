import { address, Address } from '@solana/kit';
import chalk from 'chalk';
import { getSetAuthorityInstruction, Seed } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { getPdaDetails } from '../../internals';
import { programArgument, seedArgument } from '../arguments';
import { GlobalOptions } from '../options';
import { CustomCommand, getClient } from '../utils';
import { logErrorAndExit } from '../logs';

export function setSetAuthorityCommand(program: CustomCommand): void {
  program
    .command('set-authority')
    .description(
      'Set or update an additional authority on canonical metadata accounts.'
    )
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .requiredOption(
      '--new-authority <new-authority>',
      'The new authority to set',
      (value: string): Address => {
        try {
          return address(value);
        } catch {
          logErrorAndExit(`Invalid new authority address: "${value}"`);
        }
      }
    )
    .action(doSetAuthority);
}

type Options = { newAuthority: Address };
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
  await client.planAndExecute(
    `Set additional authority on metadata account to ${chalk.bold(options.newAuthority)}`,
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
