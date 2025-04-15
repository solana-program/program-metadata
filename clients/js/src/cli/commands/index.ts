import { Command } from 'commander';
import { setFetchCommand } from './fetch';

export function setCommands(program: Command): void {
  // setWriteCommand(program);
  setFetchCommand(program);
}
