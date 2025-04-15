import {
  Address,
  getBase58Decoder,
  getBase64Decoder,
  getTransactionEncoder,
  Transaction,
} from '@solana/kit';
import chalk from 'chalk';
import { Seed } from '../../generated';
import { getProgramAuthority } from '../../utils';
import { writeMetadata } from '../../writeMetadata';
import { fileArgument, programArgument, seedArgument } from '../arguments';
import { logErrorAndExit, logSuccess } from '../logs';
import {
  GlobalOptions,
  nonCanonicalWriteOption,
  NonCanonicalWriteOption,
  setWriteOptions,
  WriteOptions,
} from '../options';
import {
  CustomCommand,
  getClient,
  getFormatFromFile,
  getPackedData,
} from '../utils';

export function setWriteCommand(program: CustomCommand): void {
  program
    .command('write')
    .description('Create or update a metadata account for a given program.')
    .addArgument(seedArgument)
    .addArgument(programArgument)
    .addArgument(fileArgument)
    .tap(setWriteOptions)
    .addOption(nonCanonicalWriteOption)
    .action(doWrite);
}

type Options = WriteOptions & NonCanonicalWriteOption;
export async function doWrite(
  seed: Seed,
  program: Address,
  file: string | undefined,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = await getClient(options);
  const { authority: programAuthority } = await getProgramAuthority(
    client.rpc,
    program
  );
  if (!options.nonCanonical && client.authority.address !== programAuthority) {
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
    const transactionBytes = getTransactionEncoder().encode({} as Transaction);
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
