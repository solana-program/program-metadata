import { Argument } from 'commander';
import { address, Address } from '@solana/kit';
import { logErrorAndExit } from './cli-logs';

export const seedArgument = new Argument(
  '<seed>',
  'Seed of the metadata account (e.g. "idl" for program IDLs).'
);

export const programArgument = new Argument(
  '<program>',
  'Program associated with the metadata account.'
).argParser((value: string): Address => {
  try {
    return address(value);
  } catch {
    logErrorAndExit(`Invalid program address: "${value}"`);
  }
});

export const fileArgument = new Argument(
  '[file]',
  'Filepath of the data to upload (creates a "direct" data source). See options for other sources such as --text, --url and --account.'
);
