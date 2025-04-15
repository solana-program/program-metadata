import { CustomCommand } from '../utils';
import { setCloseCommand } from './close';
import { setFetchCommand } from './fetch';
import { setRemoveAuthorityCommand } from './remove-authority';
import { setSetAuthorityCommand } from './set-authority';
import { setSetImmutableCommand } from './set-immutable';
import { setWriteCommand } from './write';

export function setCommands(program: CustomCommand): void {
  program
    // Metadata commands.
    .tap(setWriteCommand)
    .tap(setFetchCommand)
    .tap(setSetAuthorityCommand)
    .tap(setRemoveAuthorityCommand)
    .tap(setSetImmutableCommand)
    .tap(setCloseCommand)
    // TODO: list: List all metadata accounts owned by an authority.
    // Buffer commands.
    // TODO: list-buffers: List all buffer accounts owned by an authority.
    .tap(() => {});
}
