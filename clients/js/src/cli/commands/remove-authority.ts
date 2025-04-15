import { Address } from '@solana/kit';
import { getSetAuthorityInstruction, Seed } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { getPdaDetails } from '../../internals';
import { programArgument, seedArgument } from '../arguments';
import { logSuccess } from '../logs';
import { GlobalOptions } from '../options';
import { CustomCommand, getClient } from '../utils';

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
  logSuccess('Additional authority successfully removed');
}
