import { Command } from 'commander';
import { setFetchCommand } from './fetch';
import { setWriteCommand } from './write';

export function setCommands(program: Command): void {
  setWriteCommand(program);
  setFetchCommand(program);
}
