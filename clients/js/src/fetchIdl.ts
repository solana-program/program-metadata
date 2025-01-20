import { Address, GetAccountInfoApi, Rpc } from '@solana/web3.js';
import { Format } from './generated';
import { fetchMetadataWithContent } from './fetchMetadataWithContent';

export async function fetchIdl(
  rpc: Rpc<GetAccountInfoApi>,
  program: Address,
  authority?: Address
): Promise<unknown> {
  const seed = 'idl';
  const account = await fetchMetadataWithContent(rpc, program, seed, authority);
  switch (account.data.format) {
    case Format.Json:
      return JSON.parse(account.content);
    default:
      // Whilst we can parse JSON without any additional dependencies,
      // we cannot do the same with other formats like YAML or TOML.
      // Therefore, we return the raw content for the user to parse.
      return account.content;
  }
}
