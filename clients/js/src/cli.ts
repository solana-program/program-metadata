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
import { Command, Option } from 'commander';
import { GlobalOptions, setGlobalOptions } from './cli-options';
import {
  getClient,
  getFormat,
  getKeyPairSigners,
  getPackedData,
  getReadonlyClient,
  logErrorAndExit,
  logSuccess,
  UploadOptions,
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
program
  .command('upload')
  .argument('<seed>', 'Seed for the metadata account')
  .argument(
    '<program>',
    'Program associated with the metadata account',
    address
  )
  .argument(
    '[content]',
    'Direct content to upload. See options for other sources such as --file, --url and --account.'
  )
  .description('Upload metadata')
  .option(
    '--non-canonical',
    'When provided, a non-canonical metadata account will be uploaded using the active keypair as the authority.',
    false
  )
  .option(
    '--file <string>',
    'The path to the file to upload (creates a "direct" data source).'
  )
  .option('--url <string>', 'The url to upload (creates a "url" data source).')
  .option(
    '--account <address>',
    'The account address to upload (creates an "external" data source).'
  )
  .option(
    '--account-offset <number>',
    'The offset in which the data start on the provided account. (default: 0)'
  )
  .option(
    '--account-length <number>',
    'The length of the data on the provided account. (default: the rest of the data)'
  )
  .addOption(
    new Option(
      '--format <format>',
      'The format of the provided data. (default: the file extension or "none")'
    ).choices(['none', 'json', 'yaml', 'toml'])
  )
  .addOption(
    new Option(
      '--encoding <encoding>',
      'Describes how to encode the data. (default: "utf8")'
    ).choices(['none', 'utf8', 'base58', 'base64'])
  )
  .addOption(
    new Option(
      '--compression <compression>',
      'Describes how to compress the data. (default: "zlib")'
    ).choices(['none', 'gzip', 'zlib'])
  )
  .option(
    '--buffer-only',
    'Only create the buffer and export the transaction that sets the buffer.',
    false
  )
  .action(
    async (
      seed: string,
      program: Address,
      content: string | undefined,
      _,
      cmd: Command
    ) => {
      const options = cmd.optsWithGlobals() as UploadOptions;
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
        ...getPackedData(content, options),
        payer: client.payer,
        authority: client.authority,
        program,
        seed,
        format: getFormat(options),
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
