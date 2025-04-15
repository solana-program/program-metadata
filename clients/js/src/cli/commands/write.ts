import { Address } from '@solana/kit';
import picocolors from 'picocolors';
import { fetchMaybeMetadata, Seed } from '../../generated';
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
  CustomCommand,
  getClient,
  getPdaDetailsForWriting,
  getWriteInput,
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
  const { metadata, programData } = await getPdaDetailsForWriting(
    client,
    options,
    program,
    seed
  );
  const [metadataAccount, writeInput] = await Promise.all([
    fetchMaybeMetadata(client.rpc, metadata),
    getWriteInput(client, file, options),
  ]);

  const instructionPlan = await getWriteMetadataInstructionPlan({
    ...client,
    ...writeInput,
    payer: client.payer,
    authority: client.authority,
    program,
    programData,
    seed,
    metadata: metadataAccount,
    planner: client.planner,
  });

  await client.planAndExecute(
    `Write metadata for program ${picocolors.bold(program)} and seed "${picocolors.bold(seed)}"`,
    instructionPlan
  );
}
