import { generateKeyPairSigner } from '@solana/kit';
import chalk from 'chalk';
import { getCreateBufferInstructionPlan } from '../../createBuffer';
import { getAccountSize } from '../../utils';
import { fileArgument } from '../arguments';
import { GlobalOptions, setWriteOptions, WriteOptions } from '../options';
import { CustomCommand, getClient, getWriteInput } from '../utils';

export function setCreateBufferCommand(program: CustomCommand): void {
  program
    .command('create-buffer')
    .description('Create a buffer account to use on metadata account later on.')
    .addArgument(fileArgument)
    .tap(setWriteOptions)
    .action(doCreateBuffer);
}

type Options = WriteOptions;
export async function doCreateBuffer(
  file: string | undefined,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const [buffer, writeInput] = await Promise.all([
    generateKeyPairSigner(),
    getWriteInput(client, file, options),
  ]);
  const data = writeInput.buffer?.data.data ?? writeInput.data;
  const rent = await client.rpc
    .getMinimumBalanceForRentExemption(getAccountSize(data.length))
    .send();

  const instructionPlan = getCreateBufferInstructionPlan({
    newBuffer: buffer,
    authority: client.authority,
    payer: client.payer,
    rent,
    sourceBuffer: writeInput.buffer,
    closeSourceBuffer: writeInput.closeBuffer,
    data,
  });

  await client.planAndExecute(
    `Create buffer ${chalk.bold(buffer.address)}`,
    instructionPlan
  );
}
