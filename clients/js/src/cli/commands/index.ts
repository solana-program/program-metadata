import { Command } from 'commander';
import { setFetchCommand } from './fetch';
import { setWriteCommand } from './write';
import { setCloseCommand } from './close';
import { setSetAuthorityCommand } from './set-authority';
import { setRemoveAuthorityCommand } from './remove-authority';
import { setSetImmutableCommand } from './set-immutable';

export function setCommands(program: Command): void {
  // Metadata commands.
  setWriteCommand(program);
  setFetchCommand(program);
  setSetAuthorityCommand(program);
  setRemoveAuthorityCommand(program);
  setSetImmutableCommand(program);
  setCloseCommand(program);
  // TODO: list: List all metadata accounts owned by an authority.

  // Buffer commands.
  // TODO: list-buffers: List all buffer accounts owned by an authority.
}
