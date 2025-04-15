import { Address } from '@solana/kit';
import picocolors from 'picocolors';
import { fetchMaybeMetadata, Seed } from '../../generated';
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
import { logErrorAndExit } from '../logs';
import { getUpdateMetadataInstructionPlan } from '../../updateMetadata';

export function setUpdateCommand(program: CustomCommand): void {
  program
    .command('update')
    .description('Update a metadata account for a given program.')
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

  if (!metadataAccount.exists) {
    // TODO: show derivation seeds.
    logErrorAndExit(
      `Metadata account ${picocolors.bold(metadataAccount.address)} does not exist.`
    );
  }

  const instructionPlan = await getUpdateMetadataInstructionPlan({
    ...client,
    ...writeInput,
    payer: client.payer,
    authority: client.authority,
    program,
    programData,
    metadata: metadataAccount,
    planner: client.planner,
  });

  await client.planAndExecute(
    `Update metadata for program ${picocolors.bold(program)} and seed "${picocolors.bold(seed)}"`,
    instructionPlan
  );
}
