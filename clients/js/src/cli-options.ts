import type { MicroLamports } from '@solana/kit';
import { Command, Option } from 'commander';
import { Compression, Encoding, Format } from './generated';
import { logErrorAndExit } from './cli-utils';

export type GlobalOptions = KeypairOption &
  PayerOption &
  PriorityFeesOption &
  RpcOption;

export function setGlobalOptions(command: Command) {
  command.addOption(keypairOption);
  command.addOption(payerOption);
  command.addOption(priorityFeesOption);
  command.addOption(rpcOption);
}

export type KeypairOption = { keypair?: string };
export const keypairOption = new Option(
  '-k, --keypair <path>',
  'Path to keypair file'
).default(undefined, 'solana config');

export type PayerOption = { payer?: string };
export const payerOption = new Option(
  '-p, --payer <path>',
  'Path to keypair file of transaction fee and storage payer'
).default(undefined, 'keypair option');

export type PriorityFeesOption = { priorityFees?: MicroLamports };
export const priorityFeesOption = new Option(
  '--priority-fees <number>',
  'Priority fees in micro-lamports per compute unit for sending transactions'
)
  .default('100000')
  .argParser((value: string | undefined) =>
    value !== undefined ? (BigInt(value) as MicroLamports) : undefined
  );

export type RpcOption = { rpc?: string };
export const rpcOption = new Option('--rpc <string>', 'RPC URL').default(
  undefined,
  'solana config or localhost'
);

export type UploadOptions = {
  nonCanonical: boolean;
  file?: string;
  url?: string;
  account?: string;
  accountOffset?: string;
  accountLength?: string;
  format?: string;
  bufferOnly: boolean;
} & CompressionOption &
  EncodingOption;

export function setUploadOptions(command: Command) {
  command.addOption(keypairOption); // TODO
}

export type CompressionOption = { compression: Compression };
export const compressionOption = new Option(
  '--compression <compression>',
  'Describes how to compress the data'
)
  .choices(['none', 'gzip', 'zlib'])
  .default('zlib')
  .argParser((value: string | undefined): Compression => {
    switch (value) {
      case 'none':
        return Compression.None;
      case 'gzip':
        return Compression.Gzip;
      case undefined:
      case 'zlib':
        return Compression.Zlib;
      default:
        logErrorAndExit(`Invalid compression option: ${value}`);
    }
  });

export type EncodingOption = { encoding: Encoding };
export const encodingOption = new Option(
  '--encoding <encoding>',
  'Describes how to encode the data'
)
  .choices(['none', 'utf8', 'base58', 'base64'])
  .default('utf8')
  .argParser((value: string | undefined): Encoding => {
    switch (value) {
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
        logErrorAndExit(`Invalid encoding option: ${value}`);
    }
  });

export type FormatOption = { format?: Format };
export const formatOption = new Option(
  '--format <format>',
  'The format of the provided data'
)
  .choices(['none', 'json', 'yaml', 'toml'])
  .default(undefined, 'the file extension or "none"')
  .argParser((value: string | undefined): Format | undefined => {
    switch (value) {
      case undefined:
        return undefined;
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
