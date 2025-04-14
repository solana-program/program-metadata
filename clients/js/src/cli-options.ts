import type { MicroLamports } from '@solana/kit';
import { Command, Option } from 'commander';

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
