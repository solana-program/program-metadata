import { parse as parseToml } from '@iarna/toml';
import { Address, GetAccountInfoApi, Rpc } from '@solana/kit';
import { parse as parseYaml } from 'yaml';
import { fetchMetadataFromSeeds, Format, SeedArgs } from './generated';
import { unpackAndFetchData } from './packData';

export async function downloadMetadata(
  rpc: Rpc<GetAccountInfoApi>,
  program: Address,
  seed: SeedArgs,
  authority: Address | null = null
): Promise<string> {
  const account = await fetchMetadataFromSeeds(rpc, {
    program,
    authority,
    seed,
  });
  return await unpackAndFetchData({ rpc, ...account.data });
}

export async function downloadAndParseMetadata(
  rpc: Rpc<GetAccountInfoApi>,
  program: Address,
  seed: SeedArgs,
  authority: Address | null = null
): Promise<unknown> {
  const account = await fetchMetadataFromSeeds(rpc, {
    program,
    authority,
    seed,
  });
  const content = await unpackAndFetchData({ rpc, ...account.data });
  switch (account.data.format) {
    case Format.Json:
      return JSON.parse(content);
    case Format.Yaml:
      return parseYaml(content);
    case Format.Toml:
      return parseToml(content);
    case Format.None:
    default:
      return content;
  }
}
