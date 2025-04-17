import {
  Address,
  getAddressEncoder,
  getBase64Decoder,
  GetProgramAccountsMemcmpFilter,
  pipe,
} from '@solana/kit';
import { Argument } from 'commander';
import {
  AccountDiscriminator,
  getAccountDiscriminatorEncoder,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from '../../generated';
import { humanFileSize, logCommand, logTable } from '../logs';
import { GlobalOptions } from '../options';
import { addressParser } from '../parsers';
import { CustomCommand, getKeyPairSigners, getReadonlyClient } from '../utils';
import { ACCOUNT_HEADER_LENGTH } from '../../utils';

const DISCRIMINATOR_OFFSET = 0n;
const AUTHORITY_OFFSET = 33n;

export function setListBuffersCommand(program: CustomCommand): void {
  program
    .command('list-buffers')
    .description('List all buffer accounts owned by an authority.')
    .addArgument(
      new Argument('[authority]', 'Authority to list buffer accounts for.')
        .default(undefined, 'keypair option')
        .argParser(addressParser('authority'))
    )
    .action(doListBuffers);
}

type Options = {};
export async function doListBuffers(
  authorityArgument: Address | undefined,
  _: Options,
  cmd: CustomCommand
) {
  const options = cmd.optsWithGlobals() as GlobalOptions & Options;
  const client = getReadonlyClient(options);
  const authority =
    authorityArgument === undefined
      ? (await getKeyPairSigners(options, client.configs))[0].address
      : authorityArgument;

  logCommand(`Listing buffer accounts for...`, { authority });

  const result = await client.rpc
    .getProgramAccounts(PROGRAM_METADATA_PROGRAM_ADDRESS, {
      dataSlice: { offset: 0, length: 0 },
      filters: [getDiscriminatorFilter(), getAuthorityFilter(authority)],
    })
    .send();

  if (result.length === 0) {
    console.log('No buffer accounts found.');
    return;
  }

  const content = result.map(({ pubkey, account }) => ({
    address: pubkey,
    size: humanFileSize(Number(account.space) - ACCOUNT_HEADER_LENGTH),
  }));

  logTable(content);
}

function getDiscriminatorFilter(): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      bytes: pipe(
        AccountDiscriminator.Buffer,
        getAccountDiscriminatorEncoder().encode,
        getBase64Decoder().decode
      ),
      encoding: 'base64',
      offset: DISCRIMINATOR_OFFSET,
    },
  };
}

function getAuthorityFilter(
  authority: Address
): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      bytes: pipe(
        authority,
        getAddressEncoder().encode,
        getBase64Decoder().decode
      ),
      encoding: 'base64',
      offset: AUTHORITY_OFFSET,
    },
  };
}
