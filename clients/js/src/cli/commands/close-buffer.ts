import { address, Address } from '@solana/kit';
import picocolors from 'picocolors';
import { fetchMaybeBuffer, getCloseInstruction } from '../../generated';
import { sequentialInstructionPlan } from '../../instructionPlans';
import { logErrorAndExit } from '../logs';
import { GlobalOptions } from '../options';
import { CustomCommand, getClient } from '../utils';

export function setCloseBufferCommand(program: CustomCommand): void {
  program
    .command('close-buffer')
    .description('Close an existing buffer account.')
    .argument(
      '<buffer>',
      'The address of the buffer account to close.',
      (value: string): Address => {
        try {
          return address(value);
        } catch {
          logErrorAndExit(`Invalid buffer address: "${value}"`);
        }
      }
    )
    .option(
      '--recipient <recipient>',
      'Address receiving the storage fees for the closed account.',
      (value: string): Address => {
        try {
          return address(value);
        } catch {
          logErrorAndExit(`Invalid recipient address: "${value}"`);
        }
      }
    )
    .action(doCloseBuffer);
}

type Options = { recipient?: Address };
export async function doCloseBuffer(
  buffer: Address,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const bufferAccount = await fetchMaybeBuffer(client.rpc, buffer);

  if (!bufferAccount.exists) {
    logErrorAndExit(`Buffer account not found: "${buffer}"`);
  }

  const instructionPlan = sequentialInstructionPlan([
    getCloseInstruction({
      account: buffer,
      authority: client.authority,
      destination: options.recipient ?? client.payer.address,
    }),
  ]);

  await client.planAndExecute(
    `Close buffer ${picocolors.bold(buffer)}`,
    instructionPlan
  );
}
