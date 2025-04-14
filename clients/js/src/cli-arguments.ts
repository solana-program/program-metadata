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
