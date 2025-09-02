import { Address, sequentialInstructionPlan } from '@solana/kit';
import { getSetImmutableInstruction, Seed } from '../../generated';
import { programArgument, seedArgument } from '../arguments';
import { logCommand } from '../logs';
import {
  GlobalOptions,
  NonCanonicalWriteOption,
  nonCanonicalWriteOption,
} from '../options';
import { CustomCommand, getClient, getPdaDetailsForWriting } from '../utils';

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
  const { metadata, programData, isCanonical } = await getPdaDetailsForWriting(
    client,
    options,
    program,
    seed
  );

  logCommand(`Making metadata account immutable...`, {
    metadata,
    program,
    seed,
    authority: isCanonical ? undefined : client.authority.address,
  });

  await client.planAndExecute(
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
