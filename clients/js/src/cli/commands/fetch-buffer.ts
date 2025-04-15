import { address, Address } from '@solana/kit';
import picocolors from 'picocolors';
import { Option } from 'commander';
import { Compression, Encoding, fetchMaybeBuffer } from '../../generated';
import { unpackDirectData } from '../../packData';
import { logErrorAndExit, logSuccess } from '../logs';
import {
  compressionOption,
  CompressionOption,
  encodingOption,
  EncodingOption,
  GlobalOptions,
  outputOption,
  OutputOption,
} from '../options';
import { CustomCommand, getReadonlyClient, writeFile } from '../utils';

export function setFetchBufferCommand(program: CustomCommand): void {
  program
    .command('fetch-buffer')
    .description('Fetch the content of a buffer account.')
    .argument(
      '<buffer>',
      'The address of the buffer account to fetch.',
      (value: string): Address => {
        try {
          return address(value);
        } catch {
          logErrorAndExit(`Invalid buffer address: "${value}"`);
        }
      }
    )
    .addOption(outputOption)
    .addOption(compressionOption)
    .addOption(encodingOption)
    .addOption(
      new Option('--raw', 'Output raw data in hexadecimal format.')
        .default(false)
        .implies({ compression: Compression.None, encoding: Encoding.None })
    )
    .action(doFetchBuffer);
}

type Options = OutputOption & CompressionOption & EncodingOption;
export async function doFetchBuffer(
  buffer: Address,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = getReadonlyClient(options);
  const bufferAccount = await fetchMaybeBuffer(client.rpc, buffer);

  if (!bufferAccount.exists) {
    logErrorAndExit(`Buffer account not found: "${buffer}"`);
  }

  const content = unpackDirectData({
    data: bufferAccount.data.data,
    encoding: options.encoding,
    compression: options.compression,
  });

  if (options.output) {
    writeFile(options.output, content);
    logSuccess(`Buffer content saved to ${picocolors.bold(options.output)}`);
  } else {
    console.log(content);
  }
}
