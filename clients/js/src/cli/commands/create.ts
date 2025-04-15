import { Address } from '@solana/kit';
import chalk from 'chalk';
import { getCreateMetadataInstructionPlan } from '../../createMetadata';
import { fetchMaybeMetadata, Seed } from '../../generated';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import { logErrorAndExit } from '../logs';
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

export function setCreateCommand(program: CustomCommand): void {
  program
    .command('create')
    .description('Create a metadata account for a given program.')
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addArgument(fileArgument)
    .tap(setWriteOptions)
    .addOption(nonCanonicalWriteOption)
    .action(doCreate);
}

type Options = WriteOptions & NonCanonicalWriteOption;
export async function doCreate(
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

  if (metadataAccount.exists) {
    // TODO: show derivation seeds.
    logErrorAndExit(
      `Metadata account ${chalk.bold(metadataAccount.address)} already exists.`
    );
  }

  const instructionPlan = await getCreateMetadataInstructionPlan({
    ...client,
    ...writeInput,
    payer: client.payer,
    authority: client.authority,
    program,
    programData,
    seed,
    metadata,
    planner: client.planner,
  });

  await client.planAndExecute(
    `Create metadata for program ${chalk.bold(program)} and seed "${chalk.bold(seed)}"`,
    instructionPlan
  );
}
