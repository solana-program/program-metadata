import picocolors from 'picocolors';

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
