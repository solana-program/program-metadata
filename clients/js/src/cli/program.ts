#!/usr/bin/env node

import { setCommands } from './commands';
import { setGlobalOptions } from './options';
import { CustomCommand } from './utils';

// Define the CLI program.
const program = new CustomCommand();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .configureHelp({ showGlobalOptions: true })
  .tap(setGlobalOptions)
  .tap(setCommands)
  .parse();
