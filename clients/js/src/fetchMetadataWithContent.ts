import { Account, Address, GetAccountInfoApi, Rpc } from '@solana/web3.js';
import {
  fetchMetadata,
  findCanonicalPda,
  findNonCanonicalPda,
  Metadata,
  SeedArgs,
} from './generated';
import { unpackAndFetchData } from './packData';

export async function fetchMetadataWithContent(
  rpc: Rpc<GetAccountInfoApi>,
  program: Address,
  seed: SeedArgs,
  authority?: Address
): Promise<Account<Metadata> & { content: string }> {
  const [metadata] = authority
    ? await findNonCanonicalPda({ program, authority, seed })
    : await findCanonicalPda({ program, seed });
  const account = await fetchMetadata(rpc, metadata);
  const content = await unpackAndFetchData({ rpc, ...account.data });
  return Object.freeze({ ...account, content });
}
