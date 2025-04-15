import { Address, isSolanaError } from '@solana/kit';
import chalk from 'chalk';
import { Command } from 'commander';
import { fetchMetadataContent } from '../../fetchMetadataContent';
import { logErrorAndExit, logSuccess } from '../logs';
import {
  GlobalOptions,
  nonCanonicalReadOption,
  NonCanonicalReadOption,
  outputOption,
  OutputOption,
} from '../options';
import { getKeyPairSigners, getReadonlyClient, writeFile } from '../utils';
import { Seed } from '../../generated';
import { programArgument, seedArgument } from '../arguments';

export function setFetchCommand(program: Command): void {
  program
    .command('fetch')
    .description('Fetch the content of a metadata account for a given program.')
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addOption(nonCanonicalReadOption)
    .addOption(outputOption)
    .action(doFetch);
}

type Options = NonCanonicalReadOption & OutputOption;
async function doFetch(seed: Seed, program: Address, _: Options, cmd: Command) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = getReadonlyClient(options);
  const authority =
    options.nonCanonical === true
      ? (await getKeyPairSigners(options, client.configs))[0].address
      : options.nonCanonical
        ? options.nonCanonical
        : undefined;
  try {
    const content = await fetchMetadataContent(
      client.rpc,
      program,
      seed,
      authority
    );
    if (options.output) {
      writeFile(options.output, content);
      logSuccess(`Metadata content saved to ${chalk.bold(options.output)}`);
    } else {
      console.log(content);
    }
  } catch (error) {
    if (isSolanaError(error)) logErrorAndExit(error.message);
    throw error;
  }
}
