#!/usr/bin/env node

import {
  Address,
  address,
  getBase58Decoder,
  getBase64Decoder,
  getTransactionEncoder,
  isSolanaError,
  Transaction,
} from '@solana/kit';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  GlobalOptions,
  setGlobalOptions,
  setWriteOptions,
  WriteOptions,
} from './cli-options';
import {
  getClient,
  getFormatFromFile,
  getKeyPairSigners,
  getPackedData,
  getReadonlyClient,
  logErrorAndExit,
  logSuccess,
  writeFile,
} from './cli-utils';
import { downloadMetadata } from './downloadMetadata';
import {
  getCloseInstruction,
  getSetAuthorityInstruction,
  getSetImmutableInstruction,
} from './generated';
import { sequentialInstructionPlan } from './instructionPlans';
import { getPdaDetails } from './internals';
import { uploadMetadata } from './uploadMetadata';
import { getProgramAuthority } from './utils';

// Define the CLI program.
const program = new Command();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .configureHelp({ showGlobalOptions: true });
setGlobalOptions(program);

// Upload metadata command.
const uploadCommand = program
  .command('upload')
  .description('Upload metadata')
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .argument(
    '[file]',
    'The path to the file to upload (creates a "direct" data source). See options for other sources such as --text, --url and --account.'
  )
  .option(
    '--non-canonical',
    'When provided, a non-canonical metadata account will be uploaded using the active keypair as the authority.',
    false
  );
setWriteOptions(uploadCommand);
uploadCommand
  .option(
    '--buffer-only',
    'Only create the buffer and export the transaction that sets the buffer.',
    false
  )
  .action(
    async (
      seed: string,
      program: Address,
      file: string | undefined,
      _,
      cmd: Command
    ) => {
      const options = cmd.optsWithGlobals() as WriteOptions &
        GlobalOptions & { nonCanonical: boolean; bufferOnly: boolean };
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
          'You must be the program authority to upload a canonical metadata account. Use `--non-canonical` option to upload as a third party.'
        );
      }
      await uploadMetadata({
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

// Download metadata command.
type DownloadOptions = GlobalOptions & {
  output?: string;
  nonCanonical?: string | true;
};
program
  .command('download')
  .description('Download IDL to file')
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .option('-o, --output <path>', 'Path to save the IDL file')
  .option(
    '--non-canonical [address]',
    'When provided, a non-canonical metadata account will be downloaded using the provided address or the active keypair as the authority.',
    false
  )
  .action(async (seed: string, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as DownloadOptions;
    const client = getReadonlyClient(options);
    const authority =
      options.nonCanonical === true
        ? (await getKeyPairSigners(options, client.configs))[0].address
        : options.nonCanonical
          ? address(options.nonCanonical)
          : undefined;
    try {
      const content = await downloadMetadata(
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
  });

program
  .command('set-authority')
  .description(
    'Set or update an additional authority on canonical metadata accounts'
  )
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .argument('<new-authority>', 'The new authority to set', address)
  .action(
    async (
      seed: string,
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
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .description('Remove the additional authority on canonical metadata accounts')
  .action(async (seed: string, program: Address, _, cmd: Command) => {
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

type SetImmutableOptions = GlobalOptions & {
  nonCanonical: boolean;
};
program
  .command('set-immutable')
  .description(
    'Make the metadata account immutable, preventing any further updates'
  )
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .option(
    '--non-canonical',
    'When provided, a non-canonical metadata account will be updated using the active keypair as the authority.',
    false
  )
  .action(async (seed: string, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as SetImmutableOptions;
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

type CloseOptions = GlobalOptions & {
  nonCanonical: boolean;
};
program
  .command('close')
  .description('Close metadata account and recover rent')
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .option(
    '--non-canonical',
    'When provided, a non-canonical metadata account will be closed using the active keypair as the authority.',
    false
  )
  .action(async (seed: string, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as CloseOptions;
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
  .description('List all buffer accounts owned by an authority')
  .action(async () => {
    // TODO
  });

program
  .command('list')
  .description('List all metadata accounts owned by an authority')
  .action(async () => {
    // TODO
  });

program.parse();
