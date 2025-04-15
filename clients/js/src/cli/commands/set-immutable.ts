import { Address } from '@solana/kit';
import { getSetImmutableInstruction, Seed } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { getPdaDetails } from '../../internals';
import { getProgramAuthority } from '../../utils';
import { programArgument, seedArgument } from '../arguments';
import { logErrorAndExit } from '../logs';
import {
  GlobalOptions,
  NonCanonicalWriteOption,
  nonCanonicalWriteOption,
} from '../options';
import { CustomCommand, getClient } from '../utils';

export function setSetImmutableCommand(program: CustomCommand): void {
  program
    .command('set-immutable')
    .description(
      'Make the metadata account immutable, preventing any further updates.'
    )
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addOption(nonCanonicalWriteOption)
    .action(doSetImmutable);
}

type Options = NonCanonicalWriteOption;
async function doSetImmutable(
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
      'You must be the program authority to update a canonical metadata account. Use the `--non-canonical` option to update as a third party.'
    );
  }
  const { metadata, programData } = await getPdaDetails({
    rpc: client.rpc,
    program,
    authority: client.authority,
    seed,
  });
  await client.planAndExecute(
    'Make metadata account immutable',
    sequentialInstructionPlan([
      getSetImmutableInstruction({
        metadata,
        authority: client.authority,
        program,
        programData,
      }),
    ])
  );
}
