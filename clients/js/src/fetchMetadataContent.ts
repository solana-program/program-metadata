import { parse as parseToml } from '@iarna/toml';
import {
  Address,
  assertAccountsExist,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
} from '@solana/kit';
import { parse as parseYaml } from 'yaml';
import {
  fetchAllMaybeMetadata,
  fetchMetadataFromSeeds,
  findMetadataPda,
  Format,
  SeedArgs,
} from './generated';
import { unpackAndFetchAllData, unpackAndFetchData } from './packData';

export async function fetchMetadataContent(
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

type FetchAllMetadataContentInput = {
  program: Address;
  seed: SeedArgs;
  authority: Address | null;
}[];

export async function fetchAllMetadataContent(
  rpc: Rpc<GetMultipleAccountsApi>,
  input: FetchAllMetadataContentInput
): Promise<string[]> {
  const addresses = await Promise.all(
    input.map(async ({ program, authority, seed }) => {
      const [address] = await findMetadataPda({ program, authority, seed });

      return address;
    })
  );
  const accounts = await fetchAllMaybeMetadata(rpc, addresses);
  assertAccountsExist(accounts);
  return await unpackAndFetchAllData({ rpc, accounts });
}

function parseContent(format: Format, content: string) {
  switch (format) {
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

export async function fetchAndParseMetadataContent(
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
  return parseContent(account.data.format, content);
}

type FetchAndParseAllMetadataContentInput = FetchAllMetadataContentInput;

export async function fetchAndParseAllMetadataContent(
  rpc: Rpc<GetMultipleAccountsApi>,
  input: FetchAndParseAllMetadataContentInput
): Promise<unknown[]> {
  const addresses = await Promise.all(
    input.map(async ({ program, authority, seed }) => {
      const [address] = await findMetadataPda({ program, authority, seed });

      return address;
    })
  );
  const maybeAccounts = await fetchAllMaybeMetadata(rpc, addresses);
  const accounts = maybeAccounts.filter((acc) => acc.exists);
  const unpacked = await unpackAndFetchAllData({ rpc, accounts });
  return unpacked.map((content, index) => {
    return parseContent(accounts[index].data.format, content);
  });
}
