#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  Commitment,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  KeyPairSigner,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from '@solana/web3.js';
import { Command } from 'commander';
import { parse as parseYaml } from 'yaml';

const LOCALHOST_URL = 'http://127.0.0.1:8899';
const LOCALHOST_WEBSOCKET_URL = 'ws://127.0.0.1:8900';

// Define the CLI program.
const program = new Command();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .option(
    '-k, --keypair <path>',
    'Path to keypair file (default to solana config)'
  )
  .option(
    '-p, --payer <path>',
    'Path to keypair file of transaction fee and storage payer (default to keypair)'
  )
  .option('--rpc <string>', 'RPC URL (default to solana config or localhost)')
  .option(
    '--priority-fees <number>',
    'Priority fees per compute unit for sending transactions',
    '100000'
  );

// Upload metadata command.
program
  .command('upload <seed> <program-id> <content>')
  .description('Upload metadata')
  // .option(
  //   '-a, --add-signer-seed',
  //   "Add signer's public key as additional seed. This will create a non associated metadata account. ",
  //   false
  // )
  // .option(
  //   '--export-transaction',
  //   'Only create buffer and export setBuffer transaction'
  // )
  .action(async (/*file, programId, options*/) => {
    // TODO: Ask to confirm before creating a non-canonical metadata account.
    // try {
    //   const rpcUrl = getRpcUrl(options);
    //   const keypair = options.keypair
    //     ? Keypair.fromSecretKey(
    //         new Uint8Array(
    //           JSON.parse(fs.readFileSync(options.keypair, 'utf-8'))
    //         )
    //       )
    //     : loadDefaultKeypair();
    //   const isAuthority = await checkProgramAuthority(
    //     new PublicKey(programId),
    //     keypair.publicKey,
    //     rpcUrl
    //   );
    //   if (!isAuthority) {
    //     console.warn(AUTHORITY_WARNING_MESSAGE);
    //     return;
    //   }
    //   const result = await uploadIdlByJsonPath(
    //     file,
    //     new PublicKey(programId),
    //     keypair,
    //     rpcUrl,
    //     parseInt(options.priorityFees),
    //     options.addSignerSeed,
    //     options.exportTransaction
    //   );
    //   if (options.exportTransaction && result) {
    //     console.log(
    //       'Exported setBuffer transaction with programAuthority as signer:'
    //     );
    //     console.log('Base58:', result.base58);
    //     console.log('Base64:', result.base64);
    //   } else {
    //     console.log('IDL uploaded successfully!');
    //   }
    // } catch (error) {
    //   console.error(
    //     'Error:',
    //     error instanceof Error ? error.message : 'Unknown error occurred'
    //   );
    //   process.exit(1);
    // }
  });

program
  .command('download <seed> <program-id> [output]')
  .description('Download IDL to file')
  .option(
    '-s, --signer <pubkey>',
    'Additional signer public key to find non-associated PDAs'
  )
  .action(async (/*seed, programId, output, options*/) => {
    // try {
    //   const rpcUrl = getRpcUrl(options);
    //   const signerPubkey = options.signer
    //     ? new PublicKey(options.signer)
    //     : undefined;
    //   const idl = await fetchIDL(
    //     new PublicKey(programId),
    //     rpcUrl,
    //     signerPubkey
    //   );
    //   if (!idl) {
    //     throw new Error('No IDL found');
    //   }
    //   fs.writeFileSync(output, idl ?? '');
    //   console.log(`IDL downloaded to ${output}`);
    // } catch (error) {
    //   console.error(
    //     'Error:',
    //     error instanceof Error ? error.message : 'Unknown error occurred'
    //   );
    //   process.exit(1);
    // }
  });

program
  .command('close <seed> <program-id>')
  .description('Close metadata account and recover rent')
  .action(async () => {
    // try {
    //   const rpcUrl = getRpcUrl(options);
    //   const keypair = options.keypair
    //     ? Keypair.fromSecretKey(
    //         new Uint8Array(
    //           JSON.parse(fs.readFileSync(options.keypair, 'utf-8'))
    //         )
    //       )
    //     : loadDefaultKeypair();
    //   const isAuthority = await checkProgramAuthority(
    //     new PublicKey(programId),
    //     keypair.publicKey,
    //     rpcUrl
    //   );
    //   if (!isAuthority) {
    //     console.warn(AUTHORITY_WARNING_MESSAGE);
    //     return;
    //   }
    //   await closeProgramMetadata2(
    //     new PublicKey(programId),
    //     keypair,
    //     rpcUrl,
    //     options.seed,
    //     parseInt(options.priorityFees),
    //     options.addSignerSeed
    //   );
    //   console.log('Metadata account closed successfully!');
    // } catch (error) {
    //   console.error(
    //     'Error:',
    //     error instanceof Error ? error.message : 'Unknown error occurred'
    //   );
    //   process.exit(1);
    // }
  });

program
  .command('list-buffers')
  .description('List all buffer accounts owned by an authority')
  .action(async () => {
    //     try {
    //       const rpcUrl = getRpcUrl(options);
    //       const keypair = options.keypair
    //         ? Keypair.fromSecretKey(
    //             new Uint8Array(
    //               JSON.parse(fs.readFileSync(options.keypair, 'utf-8'))
    //             )
    //           )
    //         : loadDefaultKeypair();
    //       const buffers = await listBuffers(keypair.publicKey, rpcUrl);
    //       if (buffers.length === 0) {
    //         console.log('No buffers found for this authority');
    //         return;
    //       }
    //       console.log('\nFound buffers:');
    //       buffers.forEach(
    //         ({
    //           address,
    //           dataLength,
    //           dataType,
    //           encoding,
    //           compression,
    //           format,
    //           dataSource,
    //         }) => {
    //           console.log(`\n
    // Address: ${address.toBase58()}
    // Data Length: ${dataLength} bytes
    // Data Type: ${dataType}
    // Encoding: ${JSON.stringify(encoding, null, 2)}
    // Compression: ${JSON.stringify(compression, null, 2)}
    // Format: ${JSON.stringify(format, null, 2)}
    // Data Source: ${JSON.stringify(dataSource, null, 2)}
    // `);
    //         }
    //       );
    //     } catch (error) {
    //       console.error(
    //         'Error:',
    //         error instanceof Error ? error.message : 'Unknown error occurred'
    //       );
    //       process.exit(1);
    //     }
  });

program
  .command('list')
  .description('List all metadata PDAs owned by an authority')
  .action(async () => {
    //     try {
    //       const rpcUrl = getRpcUrl(options);
    //       const keypair = options.keypair
    //         ? Keypair.fromSecretKey(
    //             new Uint8Array(
    //               JSON.parse(fs.readFileSync(options.keypair, 'utf-8'))
    //             )
    //           )
    //         : loadDefaultKeypair();
    //       const pdas = await listPDAs(keypair.publicKey, rpcUrl);
    //       if (pdas.length === 0) {
    //         console.log('No PDAs found for this authority');
    //         return;
    //       }
    //       console.log('\nFound PDAs:');
    //       pdas.forEach(
    //         ({
    //           address,
    //           dataLength,
    //           dataType,
    //           programId,
    //           encoding,
    //           compression,
    //           format,
    //           dataSource,
    //         }) => {
    //           console.log(
    //             `\n
    // Address: ${address.toBase58()}
    // Program ID: ${programId.toBase58()}
    // Data Length: ${dataLength} bytes
    // Data Type: ${dataType}
    // Encoding: ${JSON.stringify(encoding, null, 2)}
    // Compression: ${JSON.stringify(compression, null, 2)}
    // Format: ${JSON.stringify(format, null, 2)}
    // Data Source: ${JSON.stringify(dataSource, null, 2)}`
    //           );
    //         }
    //       );
    //     } catch (error) {
    //       console.error(
    //         'Error:',
    //         error instanceof Error ? error.message : 'Unknown error occurred'
    //       );
    //       process.exit(1);
    //     }
  });

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
  if (configs.keypairPath) return configs.keypairPath;
  return path.join(os.homedir(), '.config', 'solana', 'id.json');
}

async function getKeyPairSignerFromPath(
  keypairPath: string
): Promise<KeyPairSigner> {
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair file not found at: ${keypairPath}`);
  }
  const keypairString = fs.readFileSync(keypairPath, 'utf-8');
  const keypairData = new Uint8Array(JSON.parse(keypairString));
  return await createKeyPairSignerFromBytes(keypairData);
}

type Client = {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  configs: SolanaConfigs;
};

export function getClient(options: { rpc?: string }): Client {
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
  if (configs.jsonRpcUrl) return configs.jsonRpcUrl;
  return LOCALHOST_URL;
}

function getRpcSubscriptionsUrl(
  rpcUrl: string,
  configs: SolanaConfigs
): string {
  if (configs.websocketUrl) return configs.websocketUrl;
  if (rpcUrl === LOCALHOST_URL) return LOCALHOST_WEBSOCKET_URL;
  return rpcUrl.replace(/^http/, 'ws');
}

type SolanaConfigs = {
  jsonRpcUrl?: string;
  websocketUrl?: string;
  keypairPath?: string;
  commitment?: Commitment;
};

function getSolanaConfigs(): SolanaConfigs {
  const path = getSolanaConfigPath();
  if (!fs.existsSync(path)) {
    console.warn('Solana config file not found');
    return {};
  }
  return parseYaml(fs.readFileSync(getSolanaConfigPath(), 'utf8'));
}

function getSolanaConfigPath(): string {
  return path.join(os.homedir(), '.config', 'solana', 'cli', 'config.yml');
}

program.parse();
