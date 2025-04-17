import { Address } from '@solana/kit';
import { getSetAuthorityInstruction } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { bufferArgument } from '../arguments';
import { logCommand } from '../logs';
import {
  GlobalOptions,
  NewAuthorityOption,
  newAuthorityOption,
} from '../options';
import { CustomCommand, getClient } from '../utils';

export function setSetBufferAuthorityCommand(program: CustomCommand): void {
  program
    .command('set-buffer-authority')
    .description('Update the authority of an existing buffer account.')
    .addArgument(bufferArgument)
    .addOption(newAuthorityOption)
    .action(doSetBufferAuthority);
}

type Options = NewAuthorityOption;
export async function doSetBufferAuthority(
  buffer: Address,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);

  logCommand(`Updating buffer authority...`, {
    buffer,
    'new authority': options.newAuthority,
  });

  await client.planAndExecute(
    sequentialInstructionPlan([
      getSetAuthorityInstruction({
        account: buffer,
        authority: client.authority,
        newAuthority: options.newAuthority,
      }),
    ])
  );
}
