import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  address,
  Commitment,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  KeyPairSigner,
  MicroLamports,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from '@solana/kit';
import chalk from 'chalk';
import { parse as parseYaml } from 'yaml';
import { Compression, Encoding, Format } from './generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
  InstructionPlan,
  TransactionPlanExecutor,
  TransactionPlanner,
  TransactionPlanResult,
} from './instructionPlans';
import {
  packDirectData,
  PackedData,
  packExternalData,
  packUrlData,
} from './packData';
import { GlobalOptions } from './cli-options';

const LOCALHOST_URL = 'http://127.0.0.1:8899';

export type UploadOptions = GlobalOptions & {
  nonCanonical: boolean;
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

export type Client = ReadonlyClient & {
  authority: KeyPairSigner;
  executor: TransactionPlanExecutor;
  payer: KeyPairSigner;
  planAndExecute: (
    instructionPlan: InstructionPlan
  ) => Promise<TransactionPlanResult>;
  planner: TransactionPlanner;
};

export async function getClient(options: {
  keypair?: string;
  payer?: string;
  priorityFees?: MicroLamports;
  rpc?: string;
}): Promise<Client> {
  const readonlyClient = getReadonlyClient(options);
  const [authority, payer] = await getKeyPairSigners(
    options,
    readonlyClient.configs
  );
  const planner = createDefaultTransactionPlanner({
    feePayer: payer,
    computeUnitPrice: options.priorityFees,
  });
  const executor = createDefaultTransactionPlanExecutor({
    rpc: readonlyClient.rpc,
    rpcSubscriptions: readonlyClient.rpcSubscriptions,
    parallelChunkSize: 5,
  });
  const planAndExecute = async (
    instructionPlan: InstructionPlan
  ): Promise<TransactionPlanResult> => {
    const transactionPlan = await planner(instructionPlan);
    return await executor(transactionPlan);
  };
  return {
    ...readonlyClient,
    authority,
    executor,
    payer,
    planAndExecute,
    planner,
  };
}

export type ReadonlyClient = {
  configs: SolanaConfigs;
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
};

export function getReadonlyClient(options: { rpc?: string }): ReadonlyClient {
  const configs = getSolanaConfigs();
  const rpcUrl = getRpcUrl(options, configs);
  const rpcSubscriptionsUrl = getRpcSubscriptionsUrl(rpcUrl, configs);
  return {
    configs,
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(rpcSubscriptionsUrl),
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
  return rpcUrl.replace(/^http/, 'ws').replace(/:8899$/, ':8900');
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

export async function getKeyPairSigners(
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

export function getFormat(options: { format?: string; file?: string }): Format {
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

export function getPackedData(
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

export function writeFile(filepath: string, content: string): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, content);
}

export function logSuccess(message: string): void {
  console.warn(chalk.green(`[Success] `) + message);
}

export function logWarning(message: string): void {
  console.warn(chalk.yellow(`[Warning] `) + message);
}

export function logError(message: string): void {
  console.error(chalk.red(`[Error] `) + message);
}

export function logErrorAndExit(message: string): never {
  logError(message);
  process.exit(1);
}
