#!/usr/bin/env node

import { Command } from 'commander';
import { setCommands } from './commands';
import { setGlobalOptions } from './options';

// Define the CLI program.
const program = new Command();
program
  .name('program-metadata')
  .description('CLI to manage Solana program metadata and IDLs')
  .version(__VERSION__)
  .configureHelp({ showGlobalOptions: true });

setGlobalOptions(program);
setCommands(program);

program.parse();
