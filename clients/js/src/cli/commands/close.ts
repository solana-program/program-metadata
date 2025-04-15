import { Address } from '@solana/kit';
import { getCloseInstruction, Seed } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { getPdaDetails } from '../../internals';
import { getProgramAuthority } from '../../utils';
import { programArgument, seedArgument } from '../arguments';
import { logErrorAndExit, logSuccess } from '../logs';
import {
  GlobalOptions,
  NonCanonicalWriteOption,
  nonCanonicalWriteOption,
} from '../options';
import { CustomCommand, getClient } from '../utils';

export function setCloseCommand(program: CustomCommand): void {
  program
    .command('close')
    .description('Close metadata account and recover rent.')
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addOption(nonCanonicalWriteOption)
    .action(doClose);
}

type Options = NonCanonicalWriteOption;
async function doClose(
  seed: Seed,
  program: Address,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const { authority: programAuthority } = await getProgramAuthority(
    client.rpc,
    program
  );
  if (!options.nonCanonical && client.authority.address !== programAuthority) {
    logErrorAndExit(
      'You must be the program authority to close a canonical metadata account. Use `--non-canonical` option to close as a third party.'
    );
  }
  const { metadata, programData } = await getPdaDetails({
    rpc: client.rpc,
    program,
    authority: client.authority,
    seed,
  });
  await client.planAndExecute(
    sequentialInstructionPlan([
      getCloseInstruction({
        account: metadata,
        authority: client.authority,
        program,
        programData,
        destination: client.payer.address,
      }),
    ])
  );
  logSuccess('Account successfully closed and rent recovered');
}
