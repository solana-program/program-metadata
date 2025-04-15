import chalk from 'chalk';

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
