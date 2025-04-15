import { address, Address, lamports } from '@solana/kit';
import picocolors from 'picocolors';
import { fetchMaybeBuffer } from '../../generated';
import { getUpdateBufferInstructionPlan } from '../../updateBuffer';
import { fileArgument } from '../arguments';
import { logErrorAndExit } from '../logs';
import { GlobalOptions, setWriteOptions, WriteOptions } from '../options';
import { CustomCommand, getClient, getWriteInput } from '../utils';

export function setUpdateBufferCommand(program: CustomCommand): void {
  program
    .command('update-buffer')
    .description('Update an existing buffer account.')
    .argument(
      '<buffer>',
      'The address of the buffer account to update.',
      (value: string): Address => {
        try {
          return address(value);
        } catch {
          logErrorAndExit(`Invalid buffer address: "${value}"`);
        }
      }
    )
    .addArgument(fileArgument)
    .tap(setWriteOptions)
    .action(doUpdateBuffer);
}

type Options = WriteOptions;
export async function doUpdateBuffer(
  buffer: Address,
  file: string | undefined,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const [writeInput, bufferAccount] = await Promise.all([
    getWriteInput(client, file, options),
    fetchMaybeBuffer(client.rpc, buffer),
  ]);

  if (!bufferAccount.exists) {
    logErrorAndExit(`Buffer account not found: "${buffer}"`);
  }

  const currentData = bufferAccount.data.data;
  const newData = writeInput.buffer?.data.data ?? writeInput.data;
  const sizeDifference = newData.length - currentData.length;
  const extraRent =
    sizeDifference > 0
      ? await client.rpc
          .getMinimumBalanceForRentExemption(BigInt(sizeDifference))
          .send()
      : lamports(0n);

  const instructionPlan = getUpdateBufferInstructionPlan({
    buffer,
    authority: client.authority,
    payer: client.payer,
    extraRent,
    sizeDifference,
    sourceBuffer: writeInput.buffer,
    closeSourceBuffer: writeInput.closeBuffer,
    data: newData,
  });

  await client.planAndExecute(
    `Update buffer ${picocolors.bold(buffer)}`,
    instructionPlan
  );
}
