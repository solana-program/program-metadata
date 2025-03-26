#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  Address,
  address,
  Commitment,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  getBase58Decoder,
  getBase64Decoder,
  getTransactionEncoder,
  isSolanaError,
  KeyPairSigner,
  MicroLamports,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { parse as parseYaml } from 'yaml';
import { downloadMetadata } from './downloadMetadata';
import {
  Compression,
  Encoding,
  Format,
  getCloseInstruction,
  getSetAuthorityInstruction,
  getSetImmutableInstruction,
} from './generated';
import {
  getComputeUnitInstructions,
  getDefaultMessageFactory,
  getMetadataInstructionPlanExecutor,
  getPdaDetails,
} from './internals';
import {
  packDirectData,
  PackedData,
  packExternalData,
  packUrlData,
} from './packData';
import { uploadMetadata } from './uploadMetadata';
import { getProgramAuthority } from './utils';

const LOCALHOST_URL = 'http://127.0.0.1:8899';
const LOCALHOST_WEBSOCKET_URL = 'ws://127.0.0.1:8900';

// Define the CLI program.
type GlobalOptions = {
  keypair?: string;
  payer?: string;
  rpc?: string;
  priorityFees?: MicroLamports;
};
const program = new Command();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .option(
    '-k, --keypair <path>',
    'Path to keypair file. (default: solana config)'
  )
  .option(
    '-p, --payer <path>',
    'Path to keypair file of transaction fee and storage payer. (default: keypair)'
  )
  .option('--rpc <string>', 'RPC URL. (default: solana config or localhost)')
  .addOption(
    new Option(
      '--priority-fees <number>',
      'Priority fees per compute unit for sending transactions'
    )
      .default('100000')
      .argParser((value: string | undefined) =>
        value !== undefined ? (BigInt(value) as MicroLamports) : undefined
      )
  );

// Upload metadata command.
type UploadOptions = GlobalOptions & {
  thirdParty: boolean;
  file?: string;
  url?: string;
  account?: string;
  accountOffset?: string;
  accountLength?: string;
  format?: string;
  encoding?: string;
  compression?: string;
  bufferOnly: boolean;
};
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
    '--third-party',
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
      const client = getClient(options);
      const [keypair, payer] = await getKeyPairSigners(options, client.configs);
      const { authority: programAuthority } = await getProgramAuthority(
        client.rpc,
        program
      );
      if (!options.thirdParty && keypair.address !== programAuthority) {
        logErrorAndExit(
          'You must be the program authority to upload a canonical metadata account. Use `--third-party` option to upload as a third party.'
        );
      }
      const { lastTransaction } = await uploadMetadata({
        ...client,
        ...getPackedData(content, options),
        payer,
        authority: keypair,
        program,
        seed,
        format: getFormat(options),
        buffer: options.bufferOnly ? true : undefined,
        extractLastTransaction: options.bufferOnly,
        closeBuffer: true,
        priorityFees: options.priorityFees,
      });
      if (lastTransaction) {
        const transactionBytes =
          getTransactionEncoder().encode(lastTransaction);
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
  thirdParty?: string | true;
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
    '--third-party [address]',
    'When provided, a non-canonical metadata account will be downloaded using the provided address or the active keypair as the authority.',
    false
  )
  .action(async (seed: string, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as DownloadOptions;
    const client = getClient(options);
    const authority =
      options.thirdParty === true
        ? (await getKeyPairSigners(options, client.configs))[0].address
        : options.thirdParty
          ? address(options.thirdParty)
          : undefined;
    try {
      const content = await downloadMetadata(
        client.rpc,
        program,
        seed,
        authority
      );
      if (options.output) {
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(options.output, content);
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
      const client = getClient(options);
      const [keypair, payer] = await getKeyPairSigners(options, client.configs);
      const { metadata, programData } = await getPdaDetails({
        rpc: client.rpc,
        program,
        authority: keypair,
        seed,
      });
      const planExecutor = await getCliPlanExecutor(client, payer, metadata);
      await planExecutor({
        kind: 'message',
        instructions: [
          ...getComputeUnitInstructions({
            computeUnitPrice: options.priorityFees,
            computeUnitLimit: 'simulated',
          }),
          getSetAuthorityInstruction({
            account: metadata,
            authority: keypair,
            newAuthority: address(newAuthority),
            program,
            programData,
          }),
        ],
      });
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
    const client = getClient(options);
    const [keypair, payer] = await getKeyPairSigners(options, client.configs);
    const { metadata, programData } = await getPdaDetails({
      rpc: client.rpc,
      program,
      authority: keypair,
      seed,
    });
    const planExecutor = await getCliPlanExecutor(client, payer, metadata);
    await planExecutor({
      kind: 'message',
      instructions: [
        ...getComputeUnitInstructions({
          computeUnitPrice: options.priorityFees,
          computeUnitLimit: 'simulated',
        }),
        getSetAuthorityInstruction({
          account: metadata,
          authority: keypair,
          newAuthority: null,
          program,
          programData,
        }),
      ],
    });
    logSuccess('Additional authority successfully removed');
  });

type SetImmutableOptions = GlobalOptions & {
  thirdParty: boolean;
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
    '--third-party',
    'When provided, a non-canonical metadata account will be updated using the active keypair as the authority.',
    false
  )
  .action(async (seed: string, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as SetImmutableOptions;
    const client = getClient(options);
    const [keypair, payer] = await getKeyPairSigners(options, client.configs);
    const { authority: programAuthority } = await getProgramAuthority(
      client.rpc,
      program
    );
    if (!options.thirdParty && keypair.address !== programAuthority) {
      logErrorAndExit(
        'You must be the program authority to update a canonical metadata account. Use `--third-party` option to update as a third party.'
      );
    }
    const { metadata, programData } = await getPdaDetails({
      rpc: client.rpc,
      program,
      authority: keypair,
      seed,
    });
    const planExecutor = await getCliPlanExecutor(client, payer, metadata);
    await planExecutor({
      kind: 'message',
      instructions: [
        ...getComputeUnitInstructions({
          computeUnitPrice: options.priorityFees,
          computeUnitLimit: 'simulated',
        }),
        getSetImmutableInstruction({
          metadata,
          authority: keypair,
          program,
          programData,
        }),
      ],
    });
    logSuccess('Metadata account successfully set as immutable');
  });

type CloseOptions = GlobalOptions & {
  thirdParty: boolean;
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
    '--third-party',
    'When provided, a non-canonical metadata account will be closed using the active keypair as the authority.',
    false
  )
  .action(async (seed: string, program: Address, _, cmd: Command) => {
    const options = cmd.optsWithGlobals() as CloseOptions;
    const client = getClient(options);
    const [keypair, payer] = await getKeyPairSigners(options, client.configs);
    const { authority: programAuthority } = await getProgramAuthority(
      client.rpc,
      program
    );
    if (!options.thirdParty && keypair.address !== programAuthority) {
      logErrorAndExit(
        'You must be the program authority to close a canonical metadata account. Use `--third-party` option to close as a third party.'
      );
    }
    const { metadata, programData } = await getPdaDetails({
      rpc: client.rpc,
      program,
      authority: keypair,
      seed,
    });
    const planExecutor = await getCliPlanExecutor(client, payer, metadata);
    await planExecutor({
      kind: 'message',
      instructions: [
        ...getComputeUnitInstructions({
          computeUnitPrice: options.priorityFees,
          computeUnitLimit: 'simulated',
        }),
        getCloseInstruction({
          account: metadata,
          authority: keypair,
          program,
          programData,
          destination: payer.address,
        }),
      ],
    });
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

async function getKeyPairSigners(
  options: { keypair?: string; payer?: string },
  configs: SolanaConfigs
): Promise<[KeyPairSigner, KeyPairSigner]> {
  const keypairPath = getKeyPairPath(options, configs);
  const keypairPromise = getKeyPairSignerFromPath(keypairPath);
  const payerPromise = options.payer
    ? getKeyPairSignerFromPath(options.payer)
    : keypairPromise;
  return await Promise.all([keypairPromise, payerPromise]);
}

function getKeyPairPath(
  options: { keypair?: string },
  configs: SolanaConfigs
): string {
  if (options.keypair) return options.keypair;
  if (configs.keypair_path) return configs.keypair_path;
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}

async function getKeyPairSignerFromPath(
  keypairPath: string
): Promise<KeyPairSigner> {
  if (!fs.existsSync(keypairPath)) {
    logErrorAndExit(`Keypair file not found at: ${keypairPath}`);
  }
  const keypairString = fs.readFileSync(keypairPath, 'utf-8');
  const keypairData = new Uint8Array(JSON.parse(keypairString));
  return await createKeyPairSignerFromBytes(keypairData);
}

async function getCliPlanExecutor(
  client: Client,
  payer: KeyPairSigner,
  metadata: Address
) {
  const getDefaultMessage = getDefaultMessageFactory({
    rpc: client.rpc,
    payer,
  });
  const [defaultMessage] = await Promise.all([getDefaultMessage()]);
  return getMetadataInstructionPlanExecutor({
    ...client,
    getDefaultMessage,
    payer,
    metadata,
    defaultMessage,
  });
}

type Client = {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  configs: SolanaConfigs;
};

function getClient(options: { rpc?: string }): Client {
  const configs = getSolanaConfigs();
  const rpcUrl = getRpcUrl(options, configs);
  const rpcSubscriptionsUrl = getRpcSubscriptionsUrl(rpcUrl, configs);
  return {
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(rpcSubscriptionsUrl),
    configs,
  };
}

function getRpcUrl(options: { rpc?: string }, configs: SolanaConfigs): string {
  if (options.rpc) return options.rpc;
  if (configs.json_rpc_url) return configs.json_rpc_url;
  return LOCALHOST_URL;
}

function getRpcSubscriptionsUrl(
  rpcUrl: string,
  configs: SolanaConfigs
): string {
  if (configs.websocket_url) return configs.websocket_url;
  if (rpcUrl === LOCALHOST_URL) return LOCALHOST_WEBSOCKET_URL;
  return rpcUrl.replace(/^http/, 'ws');
}

type SolanaConfigs = {
  json_rpc_url?: string;
  websocket_url?: string;
  keypair_path?: string;
  commitment?: Commitment;
};

function getSolanaConfigs(): SolanaConfigs {
  const path = getSolanaConfigPath();
  if (!fs.existsSync(path)) {
    logWarning('Solana config file not found');
    return {};
  }
  return parseYaml(fs.readFileSync(getSolanaConfigPath(), 'utf8'));
}

function getSolanaConfigPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'cli', 'config.yml');
}

function getCompression(options: { compression?: string }): Compression {
  switch (options.compression) {
    case 'none':
      return Compression.None;
    case 'gzip':
      return Compression.Gzip;
    case undefined:
    case 'zlib':
      return Compression.Zlib;
    default:
      logErrorAndExit(`Invalid compression option: ${options.compression}`);
  }
}

function getEncoding(options: { encoding?: string }): Encoding {
  switch (options.encoding) {
    case 'none':
      return Encoding.None;
    case undefined:
    case 'utf8':
      return Encoding.Utf8;
    case 'base58':
      return Encoding.Base58;
    case 'base64':
      return Encoding.Base64;
    default:
      logErrorAndExit(`Invalid encoding option: ${options.encoding}`);
  }
}

function getFormat(options: { format?: string; file?: string }): Format {
  switch (options.format) {
    case undefined:
      return getFormatFromFile(options.file);
    case 'none':
      return Format.None;
    case 'json':
      return Format.Json;
    case 'yaml':
      return Format.Yaml;
    case 'toml':
      return Format.Toml;
    default:
      logErrorAndExit(`Invalid format option: ${options.format}`);
  }
}

function getFormatFromFile(file: string | undefined): Format {
  if (!file) return Format.None;
  const extension = path.extname(file);
  switch (extension) {
    case '.json':
      return Format.Json;
    case '.yaml':
    case '.yml':
      return Format.Yaml;
    case '.toml':
      return Format.Toml;
    default:
      return Format.None;
  }
}

function getPackedData(
  content: string | undefined,
  options: UploadOptions
): PackedData {
  const compression = getCompression(options);
  const encoding = getEncoding(options);
  let packData: PackedData | null = null;
  const assertSingleUse = () => {
    if (packData) {
      logErrorAndExit(
        'Multiple data sources provided. Use only one of: `[content]`, `--file <filepath>`, `--url <url>` or `--account <address>` to provide data.'
      );
    }
  };

  if (content) {
    packData = packDirectData({ content, compression, encoding });
  }
  if (options.file) {
    assertSingleUse();
    if (!fs.existsSync(options.file)) {
      logErrorAndExit(`File not found: ${options.file}`);
    }
    const fileContent = fs.readFileSync(options.file, 'utf-8');
    packData = packDirectData({ content: fileContent, compression, encoding });
  }
  if (options.url) {
    assertSingleUse();
    packData = packUrlData({ url: options.url, compression, encoding });
  }
  if (options.account) {
    assertSingleUse();
    packData = packExternalData({
      address: address(options.account),
      offset: options.accountOffset
        ? parseInt(options.accountOffset)
        : undefined,
      length: options.accountLength
        ? parseInt(options.accountLength)
        : undefined,
      compression,
      encoding,
    });
  }

  if (!packData) {
    logErrorAndExit(
      'No data provided. Use `[content]`, `--file <filepath>`, `--url <url>` or `--account <address>` to provide data.'
    );
  }

  return packData;
}

function logSuccess(message: string): void {
  console.warn(chalk.green(`[Success] `) + message);
}

function logWarning(message: string): void {
  console.warn(chalk.yellow(`[Warning] `) + message);
}

function logError(message: string): void {
  console.error(chalk.red(`[Error] `) + message);
}

function logErrorAndExit(message: string): never {
  logError(message);
  process.exit(1);
}

program.parse();
