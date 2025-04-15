#!/usr/bin/env node

import { Address, address } from '@solana/kit';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  getCloseInstruction,
  getSetAuthorityInstruction,
  getSetImmutableInstruction,
  Seed,
} from '../generated';
import { sequentialInstructionPlan } from '../instructionPlans';
import { getPdaDetails } from '../internals';
import { getProgramAuthority } from '../utils';
import { programArgument, seedArgument } from './arguments';
import { setCommands } from './commands';
import { logErrorAndExit, logSuccess } from './logs';
import {
  GlobalOptions,
  NonCanonicalWriteOption,
  nonCanonicalWriteOption,
  setGlobalOptions,
} from './options';
import { getClient } from './utils';

// Define the CLI program.
const program = new Command();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .configureHelp({ showGlobalOptions: true });
setGlobalOptions(program);
setCommands(program);

program
  .command('set-authority')
  .description(
    'Set or update an additional authority on canonical metadata accounts.'
  )
  .addArgument(seedArgument)
  .addArgument(programArgument)
  .argument('<new-authority>', 'The new authority to set', address) // TODO: Make it a mandatory option to be explicit.
  .action(
    async (
      seed: Seed,
      program: Address,
      newAuthority: string,
      _,
      cmd: Command
    ) => {
      const options = cmd.optsWithGlobals() as GlobalOptions;
      const client = await getClient(options);
      const { metadata, programData } = await getPdaDetails({
        rpc: client.rpc,
        program,
        authority: client.authority,
        seed,
      });
      await client.planAndExecute(
        sequentialInstructionPlan([
          getSetAuthorityInstruction({
            account: metadata,
            authority: client.authority,
            newAuthority: address(newAuthority),
            program,
            programData,
          }),
        ])
      );
      logSuccess(
        `Additional authority successfully set to ${chalk.bold(newAuthority)}`
      );
    }
  );

program
  .command('remove-authority')
  .description(
    'Remove the additional authority on canonical metadata accounts.'
  )
  .addArgument(seedArgument)
  .addArgument(programArgument)
  .action(async (seed: Seed, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as GlobalOptions;
    const client = await getClient(options);
    const { metadata, programData } = await getPdaDetails({
      rpc: client.rpc,
      program,
      authority: client.authority,
      seed,
    });
    await client.planAndExecute(
      sequentialInstructionPlan([
        getSetAuthorityInstruction({
          account: metadata,
          authority: client.authority,
          newAuthority: null,
          program,
          programData,
        }),
      ])
    );
    logSuccess('Additional authority successfully removed');
  });

program
  .command('set-immutable')
  .description(
    'Make the metadata account immutable, preventing any further updates.'
  )
  .addArgument(seedArgument)
  .addArgument(programArgument)
  .addOption(nonCanonicalWriteOption)
  .action(async (seed: Seed, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as GlobalOptions &
      NonCanonicalWriteOption;
    const client = await getClient(options);
    const { authority: programAuthority } = await getProgramAuthority(
      client.rpc,
      program
    );
    if (
      !options.nonCanonical &&
      client.authority.address !== programAuthority
    ) {
      logErrorAndExit(
        'You must be the program authority to update a canonical metadata account. Use `--non-canonical` option to update as a third party.'
      );
    }
    const { metadata, programData } = await getPdaDetails({
      rpc: client.rpc,
      program,
      authority: client.authority,
      seed,
    });
    await client.planAndExecute(
      sequentialInstructionPlan([
        getSetImmutableInstruction({
          metadata,
          authority: client.authority,
          program,
          programData,
        }),
      ])
    );
    logSuccess('Metadata account successfully set as immutable');
  });

program
  .command('close')
  .description('Close metadata account and recover rent.')
  .addArgument(seedArgument)
  .addArgument(programArgument)
  .addOption(nonCanonicalWriteOption)
  .action(async (seed: Seed, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as GlobalOptions &
      NonCanonicalWriteOption;
    const client = await getClient(options);
    const { authority: programAuthority } = await getProgramAuthority(
      client.rpc,
      program
    );
    if (
      !options.nonCanonical &&
      client.authority.address !== programAuthority
    ) {
      logErrorAndExit(
        'You must be the program authority to close a canonical metadata account. Use `--non-canonical` option to close as a third party.'
      );
    }
    const { metadata, programData } = await getPdaDetails({
      rpc: client.rpc,
      program,
      authority: client.authority,
      seed,
    });
    await client.planAndExecute(
      sequentialInstructionPlan([
        getCloseInstruction({
          account: metadata,
          authority: client.authority,
          program,
          programData,
          destination: client.payer.address,
        }),
      ])
    );
    logSuccess('Account successfully closed and rent recovered');
  });

program
  .command('list-buffers')
  .description('List all buffer accounts owned by an authority.')
  .action(async () => {
    // TODO
  });

program
  .command('list')
  .description('List all metadata accounts owned by an authority.')
  .action(async () => {
    // TODO
  });

program.parse();
