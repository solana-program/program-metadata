import { Address } from '@solana/kit';
import { Console } from 'node:console';
import { Transform } from 'node:stream';

import picocolors from 'picocolors';
import { Encoding } from '../generated';

export function logCommand(
  message: string,
  data: Record<string, string | undefined> = {}
): void {
  console.log('');
  console.log(picocolors.bold(picocolors.blue(message)));
  const entries = Object.entries(data).filter(
    ([_, value]) => value !== undefined
  );
  if (entries.length > 0) {
    console.log(
      entries
        .map(([key, value], i) => {
          const prefix = i === entries.length - 1 ? '└─' : '├─';
          return ` ${picocolors.blue(prefix + ' ' + key)}: ${value}`;
        })
        .join('\n')
    );
  }
  console.log('');
}

export function logExports(
  transactionLength: number,
  options: { export: Address | boolean; exportEncoding: Encoding }
): void {
  const transactionPluralized =
    transactionLength === 1 ? 'transaction' : 'transactions';
  const forAuthority =
    typeof options.export === 'string'
      ? ` for ${picocolors.bold(options.export)}`
      : '';
  const encodingName = {
    [Encoding.None]: 'hexadecimal',
    [Encoding.Utf8]: 'UTF-8',
    [Encoding.Base58]: 'Base58',
    [Encoding.Base64]: 'Base64',
  }[options.exportEncoding];
  const message = `Exporting ${transactionLength} ${transactionPluralized}${forAuthority} in ${encodingName}:\n`;
  console.log(picocolors.yellow(message));
}

export function logSuccess(message: string): void {
  console.warn(picocolors.green(`[Success] `) + message);
}

export function logWarning(message: string): void {
  console.warn(picocolors.yellow(`[Warning] `) + message);
}

export function logError(message: string): void {
  console.error(picocolors.red(`[Error] `) + message);
}

export function logDebug(message: string): void {
  console.debug(picocolors.magenta(`[Debug] `) + message);
}

export function logErrorAndExit(message: string): never {
  logError(message);
  process.exit(1);
}

/** @see https://stackoverflow.com/a/69874540/11440277 */
export function logTable(tabularData: unknown) {
  const ts = new Transform({
    transform(chunk, _, cb) {
      cb(null, chunk);
    },
  });
  const logger = new Console({ stdout: ts });
  logger.table(tabularData);
  const table: string = (ts.read() || '').toString();
  let result = '';
  for (const row of table.split(/[\r\n]+/)) {
    let r = row.replace(/[^┬]*┬/, '┌');
    r = r.replace(/^├─*┼/, '├');
    r = r.replace(/│[^│]*/, '');
    r = r.replace(/^└─*┴/, '└');
    r = r.replace(/'/g, ' ');
    result += `${r}\n`;
  }
  console.log(result);
}

/**
 * Format bytes as human-readable text.
 * @see https://stackoverflow.com/a/14919494/11440277
 *
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 *
 * @return Formatted string.
 */
export function humanFileSize(bytes: number, si = false, dp = 1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + ' ' + units[u];
}
