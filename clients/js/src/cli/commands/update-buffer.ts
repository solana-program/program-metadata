import { Address, lamports } from '@solana/kit';
import { fetchMaybeBuffer } from '../../generated';
import { getUpdateBufferInstructionPlan } from '../../updateBuffer';
import { bufferArgument, fileArgument } from '../arguments';
import { logCommand, logErrorAndExit } from '../logs';
import { GlobalOptions, setWriteOptions, WriteOptions } from '../options';
import { CustomCommand, getClient, getWriteInput } from '../utils';

export function setUpdateBufferCommand(program: CustomCommand): void {
  program
    .command('update-buffer')
    .description('Update an existing buffer account.')
    .addArgument(bufferArgument)
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

  logCommand(`Updating buffer...`, { buffer });
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

  await client.planAndExecute(
    getUpdateBufferInstructionPlan({
      buffer,
      authority: client.authority,
      payer: client.payer,
      extraRent,
      sizeDifference,
      sourceBuffer: writeInput.buffer,
      closeSourceBuffer: writeInput.closeBuffer,
      data: newData,
    })
  );
}
