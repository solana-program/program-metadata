import { Address } from '@solana/kit';
import chalk from 'chalk';
import { fetchBuffer, fetchMaybeMetadata, Seed } from '../../generated';
import { getPdaDetails } from '../../internals';
import { getWriteMetadataInstructionPlan } from '../../writeMetadata';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import {
  GlobalOptions,
  nonCanonicalWriteOption,
  NonCanonicalWriteOption,
  setWriteOptions,
  WriteOptions,
} from '../options';
import {
  assertValidIsCanonical,
  CustomCommand,
  getClient,
  getFormatFromFile,
  getPackedData,
} from '../utils';

export function setWriteCommand(program: CustomCommand): void {
  program
    .command('write')
    .description('Create or update a metadata account for a given program.')
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addArgument(fileArgument)
    .tap(setWriteOptions)
    .addOption(nonCanonicalWriteOption)
    .action(doWrite);
}

type Options = WriteOptions & NonCanonicalWriteOption;
export async function doWrite(
  seed: Seed,
  program: Address,
  file: string | undefined,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const { programData, isCanonical, metadata } = await getPdaDetails({
    ...client,
    program,
    seed,
  });
  assertValidIsCanonical(isCanonical, options);
  const tempBuffer: Address | undefined = undefined;
  const [metadataAccount, buffer] = await Promise.all([
    fetchMaybeMetadata(client.rpc, metadata),
    tempBuffer
      ? fetchBuffer(client.rpc, tempBuffer)
      : Promise.resolve(undefined),
  ]);

  const instructionPlan = await getWriteMetadataInstructionPlan({
    ...client,
    ...getPackedData(file, options),
    payer: client.payer,
    authority: client.authority,
    program,
    seed,
    format: options.format ?? getFormatFromFile(file),
    closeBuffer: true,
    buffer,
    metadata: metadataAccount,
    programData: isCanonical ? programData : undefined,
    planner: client.planner,
  });

  await client.planAndExecute(
    `Upload metadata for program ${chalk.bold(program)} and seed "${chalk.bold(seed)}"`,
    instructionPlan
  );
}
