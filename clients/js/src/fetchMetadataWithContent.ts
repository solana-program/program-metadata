import { Account, Address, GetAccountInfoApi, Rpc } from '@solana/web3.js';
import { fetchMetadataFromSeeds, Metadata, SeedArgs } from './generated';
import { unpackAndFetchData } from './packData';

export async function fetchMetadataWithContent(
  rpc: Rpc<GetAccountInfoApi>,
  program: Address,
  seed: SeedArgs,
  authority: Address | null = null
): Promise<Account<Metadata> & { content: string }> {
  const account = await fetchMetadataFromSeeds(rpc, {
    program,
    authority,
    seed,
  });
  const content = await unpackAndFetchData({ rpc, ...account.data });
  return Object.freeze({ ...account, content });
}
