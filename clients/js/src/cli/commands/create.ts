import { Address } from '@solana/kit';
import picocolors from 'picocolors';
import { getCreateMetadataInstructionPlan } from '../../createMetadata';
import { fetchMaybeMetadata, Seed } from '../../generated';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import { logCommand, logErrorAndExit } from '../logs';
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
  const { metadata, programData, isCanonical } = await getPdaDetailsForWriting(
    client,
    options,
    program,
    seed
  );

  logCommand(`Creating new metadata account...`, {
    metadata,
    program,
    seed,
    authority: isCanonical ? undefined : client.authority.address,
  });

  const [metadataAccount, writeInput] = await Promise.all([
    fetchMaybeMetadata(client.rpc, metadata),
    getWriteInput(client, file, options),
  ]);

  if (metadataAccount.exists) {
    logErrorAndExit(
      `Metadata account ${picocolors.bold(metadataAccount.address)} already exists.`
    );
  }

  await client.planAndExecute(
    await getCreateMetadataInstructionPlan({
      ...client,
      ...writeInput,
      payer: client.payer,
      authority: client.authority,
      program,
      programData,
      seed,
      metadata,
      planner: client.planner,
    })
  );
}
