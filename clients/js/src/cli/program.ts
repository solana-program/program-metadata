import { setCommands } from './commands';
import { setGlobalOptions } from './options';
import { CustomCommand } from './utils';

export async function programMetadata(
  args: string[],
  opts?: { suppressOutput?: boolean }
): Promise<void> {
  await createProgram({
    exitOverride: true,
    suppressOutput: opts?.suppressOutput,
  }).parseAsync(args, { from: 'user' });
}

export function createProgram(internalOptions?: {
  exitOverride?: boolean;
  suppressOutput?: boolean;
}): CustomCommand {
  const program = new CustomCommand();
  program
    .name('program-metadata')
    .description('CLI to manage Solana program metadata and IDLs')
    .version(__VERSION__)
    .configureHelp({ showGlobalOptions: true })
    .tap(setGlobalOptions)
    .tap(setCommands);

  // Internal options.
  if (internalOptions?.exitOverride) {
    program.exitOverride();
  }
  if (internalOptions?.suppressOutput) {
    program.configureOutput({
      writeErr: () => {},
      writeOut: () => {},
    });
  }

  return program;
}
