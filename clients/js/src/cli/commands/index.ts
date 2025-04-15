import { CustomCommand } from '../utils';
import { setCloseCommand } from './close';
import { setCreateCommand } from './create';
import { setCreateBufferCommand } from './create-buffer';
import { setFetchCommand } from './fetch';
import { setRemoveAuthorityCommand } from './remove-authority';
import { setSetAuthorityCommand } from './set-authority';
import { setSetImmutableCommand } from './set-immutable';
import { setUpdateCommand } from './update';
import { setUpdateBufferCommand } from './update-buffer';
import { setWriteCommand } from './write';

export function setCommands(program: CustomCommand): void {
  program
    // Metadata commands.
    // TODO: list: List all metadata accounts owned by an authority.
    .tap(setWriteCommand)
    .tap(setCreateCommand)
    .tap(setUpdateCommand)
    .tap(setFetchCommand)
    .tap(setSetAuthorityCommand)
    .tap(setRemoveAuthorityCommand)
    .tap(setSetImmutableCommand)
    .tap(setCloseCommand)

    // Buffer commands.
    // TODO: list-buffers: List all buffer accounts owned by an authority.
    .tap(setCreateBufferCommand)
    .tap(setUpdateBufferCommand);
}
