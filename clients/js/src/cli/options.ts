import { type Address, type MicroLamports } from '@solana/kit';
import { Option } from 'commander';
import { Compression, Encoding, Format } from '../generated';
import { logErrorAndExit } from './logs';
import {
  addressOrBooleanParser,
  addressParser,
  encodingParser,
} from './parsers';
import { CustomCommand } from './utils';

export type GlobalOptions = KeypairOption &
  PayerOption &
  PriorityFeesOption &
  RpcOption &
  ExportOption &
  ExportEncodingOption;

export function setGlobalOptions(command: CustomCommand) {
  command
    .addOption(keypairOption)
    .addOption(payerOption)
    .addOption(priorityFeesOption)
    .addOption(rpcOption)
    .addOption(exportOption)
    .addOption(exportEncodingOption);
}

export type KeypairOption = { keypair?: string };
export const keypairOption = new Option(
  '-k, --keypair <path>',
  'Path to keypair file.'
).default(undefined, 'solana config');

export type PayerOption = { payer?: string };
export const payerOption = new Option(
  '-p, --payer <path>',
  'Path to keypair file of transaction fee and storage payer.'
).default(undefined, 'keypair option');

export type PriorityFeesOption = { priorityFees?: MicroLamports };
export const priorityFeesOption = new Option(
  '--priority-fees <number>',
  'Priority fees in micro-lamports per compute unit for sending transactions.'
)
  .default('100000')
  .argParser((value: string | undefined) =>
    value !== undefined ? (BigInt(value) as MicroLamports) : undefined
  );

export type RpcOption = { rpc?: string };
export const rpcOption = new Option('--rpc <string>', 'RPC URL.').default(
  undefined,
  'solana config or localhost'
);

export type ExportOption = { export: Address | boolean };
export const exportOption = new Option(
  '--export [address]',
  'When provided, export transactions instead of running them. An optional address can be provided to override the local keypair as the authority.'
)
  .default(false)
  .argParser(addressOrBooleanParser('export'));

export type ExportEncodingOption = { exportEncoding: Encoding };
export const exportEncodingOption = new Option(
  '--export-encoding <encoding>',
  'Describes how to encode exported transactions.'
)
  .choices(['none', 'utf8', 'base58', 'base64'])
  .default(Encoding.Base64, 'base64')
  .argParser(encodingParser);

export type WriteOptions = TextOption &
  UrlOption &
  AccountOption &
  AccountOffsetOption &
  AccountLengthOption &
  BufferOption &
  CloseBufferOption &
  CompressionOption &
  EncodingOption &
  FormatOption;

export function setWriteOptions(command: CustomCommand) {
  command
    // Data sources.
    .addOption(textOption)
    .addOption(urlOption)
    .addOption(accountOption)
    .addOption(accountOffsetOption)
    .addOption(accountLengthOption)
    .addOption(bufferOption)
    .addOption(closeBufferOption)
    // Enums.
    .addOption(compressionOption)
    .addOption(encodingOption)
    .addOption(formatOption);
}

export type TextOption = { text?: string };
export const textOption = new Option(
  '--text <content>',
  'Direct content to upload (creates a "direct" data source).'
);

export type UrlOption = { url?: string };
export const urlOption = new Option(
  '--url <url>',
  'The url to upload (creates a "url" data source).'
);

export type AccountOption = { account?: string };
export const accountOption = new Option(
  '--account <address>',
  'The account address to upload (creates an "external" data source). See also: "--account-offset" and "--account-length".'
);

export type AccountOffsetOption = { accountOffset?: string };
export const accountOffsetOption = new Option(
  '--account-offset <number>',
  'The offset in which the data start on the provided account. Requires "--account" to be set.'
).default(undefined, '0');

export type AccountLengthOption = { accountLength?: string };
export const accountLengthOption = new Option(
  '--account-length <number>',
  'The length of the data on the provided account. Requires "--account" to be set.'
).default(undefined, 'the rest of the data');

export type BufferOption = { buffer?: Address };
export const bufferOption = new Option(
  '--buffer <address>',
  'The address of the buffer to use as source (creates a "direct" data source).'
);

export type CloseBufferOption = { closeBuffer: Address | boolean };
export const closeBufferOption = new Option(
  '--close-buffer [address]',
  'Whether to close provided `--buffer` account after using its data.'
)
  .default(false)
  .argParser(addressOrBooleanParser('--close-buffer recipient'));

export type CompressionOption = { compression: Compression };
export const compressionOption = new Option(
  '--compression <compression>',
  'Describes how to compress the data.'
)
  .choices(['none', 'gzip', 'zlib'])
  .default(Compression.Zlib, 'zlib')
  .argParser((value: string): Compression => {
    switch (value) {
      case 'none':
        return Compression.None;
      case 'gzip':
        return Compression.Gzip;
      case 'zlib':
        return Compression.Zlib;
      default:
        logErrorAndExit(`Invalid compression option: ${value}`);
    }
  });

export type EncodingOption = { encoding: Encoding };
export const encodingOption = new Option(
  '--encoding <encoding>',
  'Describes how to encode the data.'
)
  .choices(['none', 'utf8', 'base58', 'base64'])
  .default(Encoding.Utf8, 'utf8')
  .argParser(encodingParser);

export type FormatOption = { format?: Format };
export const formatOption = new Option(
  '--format <format>',
  'The format of the provided data.'
)
  .choices(['none', 'json', 'yaml', 'toml'])
  .default(undefined, 'the file extension or "none"')
  .argParser((value: string): Format => {
    switch (value) {
      case 'none':
        return Format.None;
      case 'json':
        return Format.Json;
      case 'yaml':
        return Format.Yaml;
      case 'toml':
        return Format.Toml;
      default:
        logErrorAndExit(`Invalid format option: ${value}`);
    }
  });

export type NonCanonicalWriteOption = { nonCanonical: boolean };
export const nonCanonicalWriteOption = new Option(
  '--non-canonical',
  'When provided, a non-canonical metadata account will be closed using the active keypair as the authority.'
).default(false);

export type NonCanonicalReadOption = { nonCanonical: Address | boolean };
export const nonCanonicalReadOption = new Option(
  '--non-canonical [address]',
  'When provided, a non-canonical metadata account will be downloaded using the provided address or the active keypair as the authority.'
)
  .default(false)
  .argParser(addressOrBooleanParser('non-canonical'));

export type OutputOption = { output?: string };
export const outputOption = new Option(
  '-o, --output <path>',
  'Path to save the retrieved data.'
);

export type NewAuthorityOption = { newAuthority: Address };
export const newAuthorityOption = new Option(
  '--new-authority <new-authority>',
  'The new authority to set'
)
  .makeOptionMandatory()
  .argParser(addressParser('new authority'));
