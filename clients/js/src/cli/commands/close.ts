import { Address } from '@solana/kit';
import { getCloseInstruction, Seed } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { programArgument, seedArgument } from '../arguments';
import {
  GlobalOptions,
  NonCanonicalWriteOption,
  nonCanonicalWriteOption,
} from '../options';
import { CustomCommand, getClient, getPdaDetailsForWriting } from '../utils';
import { logCommand } from '../logs';

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
  const { metadata, programData, isCanonical } = await getPdaDetailsForWriting(
    client,
    options,
    program,
    seed
  );

  logCommand(`Closing metadata account...`, {
    metadata,
    program,
    seed,
    authority: isCanonical ? undefined : client.authority.address,
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
}
