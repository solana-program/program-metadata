import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  Account,
  Address,
  address,
  Commitment,
  createKeyPairSignerFromBytes,
  createNoopSigner,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  MessageSigner,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  TransactionSigner,
} from '@solana/kit';
import { Command } from 'commander';
import { parse as parseYaml } from 'yaml';
import { Buffer, DataSource, fetchBuffer, Format, Seed } from '../generated';
import {
  createDefaultTransactionPlanExecutor,
  createDefaultTransactionPlanner,
  InstructionPlan,
  TransactionPlanExecutor,
  TransactionPlanner,
  TransactionPlanResult,
} from '../instructionPlans';
import { getPdaDetails, PdaDetails } from '../internals';
import {
  packDirectData,
  PackedData,
  packExternalData,
  packUrlData,
} from '../packData';
import { logErrorAndExit, logSuccess, logWarning } from './logs';
import {
  ExportOption,
  GlobalOptions,
  KeypairOption,
  NonCanonicalWriteOption,
  PayerOption,
  RpcOption,
  WriteOptions,
} from './options';

const LOCALHOST_URL = 'http://127.0.0.1:8899';
const DATA_SOURCE_OPTIONS =
  '`[file]`, `--buffer <address>`, `--text <content>`, `--url <url>` or `--account <address>`';

export class CustomCommand extends Command {
  createCommand(name: string) {
    return new CustomCommand(name);
  }

  tap(fn: (command: CustomCommand) => void) {
    fn(this);
    return this;
  }
}

export type Client = ReadonlyClient & {
  authority: TransactionSigner & MessageSigner;
  executor: TransactionPlanExecutor;
  payer: TransactionSigner & MessageSigner;
  planAndExecute: (
    description: string,
    instructionPlan: InstructionPlan
  ) => Promise<TransactionPlanResult>;
  planner: TransactionPlanner;
};

export async function getClient(options: GlobalOptions): Promise<Client> {
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
    description: string,
    instructionPlan: InstructionPlan
  ): Promise<TransactionPlanResult> => {
    console.log(description);
    const transactionPlan = await planner(instructionPlan);
    const result = await executor(transactionPlan);
    logSuccess('Operation executed successfully');
    return result;
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

export function getReadonlyClient(options: RpcOption): ReadonlyClient {
  const configs = getSolanaConfigs();
  const rpcUrl = getRpcUrl(options, configs);
  const rpcSubscriptionsUrl = getRpcSubscriptionsUrl(rpcUrl, configs);
  return {
    configs,
    rpc: createSolanaRpc(rpcUrl),
    rpcSubscriptions: createSolanaRpcSubscriptions(rpcSubscriptionsUrl),
  };
}

function getRpcUrl(options: RpcOption, configs: SolanaConfigs): string {
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
  options: KeypairOption & PayerOption & ExportOption,
  configs: SolanaConfigs
): Promise<
  [TransactionSigner & MessageSigner, TransactionSigner & MessageSigner]
> {
  const keypairPath = getKeyPairPath(options, configs);
  const keypairPromise = getKeyPairSignerFromPath(keypairPath);
  const payerPromise = options.payer
    ? getKeyPairSignerFromPath(options.payer)
    : keypairPromise;
  const [keypair, payer] = await Promise.all([keypairPromise, payerPromise]);
  if (typeof options.export === 'string') {
    return [createNoopSigner(options.export), payer];
  }
  return [keypair, payer];
}

function getKeyPairPath(
  options: KeypairOption,
  configs: SolanaConfigs
): string {
  if (options.keypair) return options.keypair;
  if (configs.keypair_path) return configs.keypair_path;
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}

async function getKeyPairSignerFromPath(keypairPath: string) {
  if (!fs.existsSync(keypairPath)) {
    logErrorAndExit(`Keypair file not found at: ${keypairPath}`);
  }
  const keypairString = fs.readFileSync(keypairPath, 'utf-8');
  const keypairData = new Uint8Array(JSON.parse(keypairString));
  return await createKeyPairSignerFromBytes(keypairData);
}

export function getFormatFromFile(file: string | undefined): Format {
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

export async function getPdaDetailsForWriting(
  client: Client,
  options: NonCanonicalWriteOption,
  program: Address,
  seed: Seed
): Promise<PdaDetails> {
  const details = await getPdaDetails({ ...client, program, seed });
  assertValidIsCanonical(details.isCanonical, options);
  const isCanonical = !options.nonCanonical;
  return {
    programData: isCanonical ? details.programData : undefined,
    metadata: details.metadata,
    isCanonical,
  };
}

export async function getWriteInput(
  client: Client,
  file: string | undefined,
  options: WriteOptions
): Promise<
  PackedData & {
    buffer?: Account<Buffer>;
    format: Format;
    closeBuffer?: boolean;
  }
> {
  const buffer = options.buffer
    ? await fetchBuffer(client.rpc, options.buffer)
    : undefined;
  return {
    ...getPackedData(file, options),
    format: options.format ?? getFormatFromFile(file),
    closeBuffer: options.buffer ? options.closeBuffer : true,
    buffer,
  };
}

export function getPackedData(
  file: string | undefined,
  options: WriteOptions
): PackedData {
  const { compression, encoding } = options;
  let packData: PackedData | null = null;
  const assertSingleUse = () => {
    if (packData) {
      logErrorAndExit(
        `Multiple data sources provided. Use only one of: ${DATA_SOURCE_OPTIONS} to provide data.`
      );
    }
  };

  if (file) {
    if (!fs.existsSync(file)) {
      logErrorAndExit(`File not found: ${file}`);
    }
    const fileContent = fs.readFileSync(file, 'utf-8');
    packData = packDirectData({ content: fileContent, compression, encoding });
  }
  if (options.buffer) {
    assertSingleUse();
    packData = {
      data: new Uint8Array(0),
      compression,
      encoding,
      dataSource: DataSource.Direct,
    };
  }
  if (options.text) {
    assertSingleUse();
    packData = packDirectData({ content: options.text, compression, encoding });
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
      `No data provided. Use ${DATA_SOURCE_OPTIONS} to provide data.`
    );
  }

  return packData;
}

export function writeFile(filepath: string, content: string): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, content);
}

export function assertValidIsCanonical(
  isCanonical: boolean,
  options: NonCanonicalWriteOption
): void {
  const wantsCanonical = !options.nonCanonical;
  if (wantsCanonical && !isCanonical) {
    logErrorAndExit(
      'You must be the program authority or an authorized authority to manage canonical metadata accounts. ' +
        'Use the `--non-canonical` option to manage metadata accounts as a third party.'
    );
  }
}
