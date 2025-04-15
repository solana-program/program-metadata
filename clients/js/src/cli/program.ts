#!/usr/bin/env node

import {
  Address,
  address,
  getBase58Decoder,
  getBase64Decoder,
  getTransactionEncoder,
  Transaction,
} from '@solana/kit';
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
import { writeMetadata } from '../writeMetadata';
import { fileArgument, programArgument, seedArgument } from './arguments';
import { setCommands } from './commands';
import { logErrorAndExit, logSuccess } from './logs';
import {
  GlobalOptions,
  NonCanonicalWriteOption,
  nonCanonicalWriteOption,
  setGlobalOptions,
  setWriteOptions,
  WriteOptions,
} from './options';
import { getClient, getFormatFromFile, getPackedData } from './utils';

// Define the CLI program.
const program = new Command();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .configureHelp({ showGlobalOptions: true });
setGlobalOptions(program);
setCommands(program);

// Write metadata command.
const writeCommand = program
  .command('write')
  .description('Create or update a metadata account for a given program.')
  .addArgument(seedArgument)
  .addArgument(programArgument)
  .addArgument(fileArgument)
  .addOption(nonCanonicalWriteOption);
setWriteOptions(writeCommand);
writeCommand
  .option(
    '--buffer-only',
    'Only create the buffer and export the transaction that sets the buffer.',
    false
  )
  .action(
    async (
      seed: Seed,
      program: Address,
      file: string | undefined,
      _,
      cmd: Command
    ) => {
      const options = cmd.optsWithGlobals() as WriteOptions &
        GlobalOptions &
        NonCanonicalWriteOption & { bufferOnly: boolean };
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
          'You must be the program authority to write to a canonical metadata account. Use `--non-canonical` option to write as a third party.'
        );
      }
      await writeMetadata({
        ...client,
        ...getPackedData(file, options),
        payer: client.payer,
        authority: client.authority,
        program,
        seed,
        format: options.format ?? getFormatFromFile(file),
        closeBuffer: true,
        priorityFees: options.priorityFees,
      });
      const exportTransaction = false; // TODO: Option
      if (exportTransaction) {
        const transactionBytes = getTransactionEncoder().encode(
          {} as Transaction
        );
        const base64EncodedTransaction =
          getBase64Decoder().decode(transactionBytes);
        const base58EncodedTransaction =
          getBase58Decoder().decode(transactionBytes);
        logSuccess(
          `Buffer successfully created for program ${chalk.bold(program)} and seed "${chalk.bold(seed)}"!\n` +
            `Use the following transaction data to apply the buffer:\n\n` +
            `[base64]\n${base64EncodedTransaction}\n\n[base58]\n${base58EncodedTransaction}`
        );
      } else {
        logSuccess(
          `Metadata uploaded successfully for program ${chalk.bold(program)} and seed "${chalk.bold(seed)}"!`
        );
      }
    }
  );

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
