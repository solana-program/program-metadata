import { Address } from '@solana/kit';
import { fetchMaybeMetadata, Seed } from '../../generated';
import { getWriteMetadataInstructionPlan } from '../../writeMetadata';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import { logCommand } from '../logs';
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
  const { metadata, programData, isCanonical } = await getPdaDetailsForWriting(
    client,
    options,
    program,
    seed
  );

  logCommand(`Writing metadata account...`, {
    metadata,
    program,
    seed,
    authority: isCanonical ? undefined : client.authority.address,
  });

  const [metadataAccount, writeInput] = await Promise.all([
    fetchMaybeMetadata(client.rpc, metadata),
    getWriteInput(client, file, options),
  ]);

  await client.planAndExecute(
    await getWriteMetadataInstructionPlan({
      ...client,
      ...writeInput,
      payer: client.payer,
      authority: client.authority,
      program,
      programData,
      seed,
      metadata: metadataAccount,
      planner: client.planner,
    })
  );
}
