import { CustomCommand } from '../utils';
import { setCloseCommand } from './close';
import { setCloseBufferCommand } from './close-buffer';
import { setCreateCommand } from './create';
import { setCreateBufferCommand } from './create-buffer';
import { setFetchCommand } from './fetch';
import { setFetchBufferCommand } from './fetch-buffer';
import { setRemoveAuthorityCommand } from './remove-authority';
import { setSetAuthorityCommand } from './set-authority';
import { setSetImmutableCommand } from './set-immutable';
import { setUpdateCommand } from './update';
import { setUpdateBufferCommand } from './update-buffer';
import { setWriteCommand } from './write';

export function setCommands(program: CustomCommand): void {
  program
    // Metadata commands.
    .tap(setWriteCommand)
    .tap(setCreateCommand)
    .tap(setUpdateCommand)
    // TODO: list: List all metadata accounts owned by an authority.
    .tap(setFetchCommand)
    .tap(setSetAuthorityCommand)
    .tap(setRemoveAuthorityCommand)
    .tap(setSetImmutableCommand)
    .tap(setCloseCommand)

    // Buffer commands.
    .tap(setCreateBufferCommand)
    .tap(setUpdateBufferCommand)
    // TODO: list-buffers: List all buffer accounts owned by an authority.
    .tap(setFetchBufferCommand)
    .tap(setCloseBufferCommand);
}
