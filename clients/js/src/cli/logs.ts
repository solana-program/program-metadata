import picocolors from 'picocolors';

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

export function logSuccess(message: string): void {
  console.warn(picocolors.green(`[Success] `) + message);
}

export function logWarning(message: string): void {
  console.warn(picocolors.yellow(`[Warning] `) + message);
}

export function logError(message: string): void {
  console.error(picocolors.red(`[Error] `) + message);
}

export function logErrorAndExit(message: string): never {
  logError(message);
  process.exit(1);
}
