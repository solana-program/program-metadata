import {
  Account,
  Address,
  assertAccountExists,
  assertAccountsExist,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  getBase16Decoder,
  getBase16Encoder,
  getBase58Decoder,
  getBase58Encoder,
  getBase64Decoder,
  getBase64Encoder,
  GetMultipleAccountsApi,
  getUtf8Decoder,
  getUtf8Encoder,
  pipe,
  ReadonlyUint8Array,
  Rpc,
  unwrapOption,
} from '@solana/kit';
import { deflate, gzip, inflate, ungzip } from 'pako';
import {
  Compression,
  DataSource,
  Encoding,
  getExternalDataDecoder,
  getExternalDataEncoder,
  Metadata,
} from './generated';

export type PackedData = {
  compression: Compression;
  encoding: Encoding;
  dataSource: DataSource;
  data: ReadonlyUint8Array;
};

export type UnpackedData = {
  address: Address;
  offset?: number;
  length?: number;
};

export function packDirectData(input: {
  content: string;
  /** Defaults to `Compression.Zlib`. */
  compression?: Compression;
  /** Defaults to `Encoding.Utf8`. */
  encoding?: Encoding;
}): PackedData {
  const {
    content,
    compression = Compression.Zlib,
    encoding = Encoding.Utf8,
  } = input;
  const data = pipe(
    content,
    (c) => encodeData(c, encoding),
    (c) => compressData(c, compression)
  );
  return { compression, encoding, dataSource: DataSource.Direct, data };
}

export function packUrlData(input: {
  url: string;
  /** Defaults to `Compression.Zlib`. */
  compression?: Compression;
  /** Defaults to `Encoding.Utf8`. */
  encoding?: Encoding;
}): PackedData {
  const {
    url,
    compression = Compression.Zlib,
    encoding = Encoding.Utf8,
  } = input;
  const data = pipe(
    url,
    (c) => encodeData(c, encoding),
    (c) => compressData(c, compression)
  );
  return { compression, encoding, dataSource: DataSource.Url, data };
}

export function packExternalData(input: {
  address: Address;
  offset?: number;
  length?: number;
  /** Refers to the compression on the external account. */
  compression: Compression;
  /** Refers to the encoding on the external account. */
  encoding: Encoding;
}): PackedData {
  const data = getExternalDataEncoder().encode({
    address: input.address,
    offset: input.offset ?? 0,
    length: input.length ?? null,
  });
  return {
    compression: input.compression,
    encoding: input.encoding,
    dataSource: DataSource.External,
    data,
  };
}

export function unpackDirectData(
  input: Omit<PackedData, 'dataSource'>
): string {
  return pipe(
    input.data,
    (d) => uncompressData(d, input.compression),
    (d) => decodeData(d, input.encoding)
  );
}

export function unpackUrlData(input: Omit<PackedData, 'dataSource'>): string {
  return pipe(
    input.data,
    (d) => uncompressData(d, input.compression),
    (d) => decodeData(d, input.encoding)
  );
}

export async function unpackAndFetchUrlData(
  input: Omit<PackedData, 'dataSource'>
): Promise<string> {
  const url = unpackUrlData(input);
  const response = await fetch(url);
  return await response.text();
}

export function unpackExternalData(data: ReadonlyUint8Array): UnpackedData {
  const externalData = getExternalDataDecoder().decode(data);
  return {
    address: externalData.address,
    offset: externalData.offset === 0 ? undefined : externalData.offset,
    length: unwrapOption(externalData.length) ?? undefined,
  };
}

export function uncompressAndDecodeExternalData({
  compression,
  encoding,
  account,
  unpackedExternalData,
}: Pick<PackedData, 'compression' | 'encoding'> & {
  account: Account<Uint8Array>;
  unpackedExternalData: UnpackedData;
}): string {
  let data = account.data;
  if (unpackedExternalData.offset !== undefined) {
    data = data.slice(unpackedExternalData.offset);
  }
  if (unpackedExternalData.length !== undefined) {
    data = data.slice(0, unpackedExternalData.length);
  }
  if (data.length === 0) {
    return '';
  }
  return pipe(
    data,
    (d) => uncompressData(d, compression),
    (d) => decodeData(d, encoding)
  );
}

export async function unpackAndFetchExternalData(
  input: Omit<PackedData, 'dataSource'> & { rpc: Rpc<GetAccountInfoApi> }
): Promise<string> {
  const unpackedExternalData = unpackExternalData(input.data);
  const account = await fetchEncodedAccount(
    input.rpc,
    unpackedExternalData.address
  );
  assertAccountExists(account);
  return uncompressAndDecodeExternalData({
    compression: input.compression,
    encoding: input.encoding,
    account,
    unpackedExternalData,
  });
}

export async function unpackAndFetchData(
  input: PackedData & { rpc: Rpc<GetAccountInfoApi> }
): Promise<string> {
  switch (input.dataSource) {
    case DataSource.Direct:
      return unpackDirectData(input);
    case DataSource.Url:
      return await unpackAndFetchUrlData(input);
    case DataSource.External:
      return await unpackAndFetchExternalData(input);
    default:
      throw new Error('Unsupported data source');
  }
}

export async function unpackAndFetchAllData({
  accounts,
  rpc,
}: {
  accounts: Account<Metadata>[];
  rpc: Rpc<GetMultipleAccountsApi>;
}) {
  const unpackedExternalAccounts = accounts
    .filter((account) => account.data.dataSource === DataSource.External)
    .map((account) => ({
      address: account.address,
      unpacked: unpackExternalData(account.data.data),
    }));

  const fetchedExternalAccounts = await fetchEncodedAccounts(
    rpc,
    unpackedExternalAccounts.map((account) => account.unpacked.address)
  );
  assertAccountsExist(fetchedExternalAccounts);

  return Promise.all(
    accounts.map(async (account) => {
      switch (account.data.dataSource) {
        case DataSource.Direct:
          return unpackDirectData(account.data);
        case DataSource.Url:
          return await unpackAndFetchUrlData(account.data);
        case DataSource.External: {
          const accountIndex = unpackedExternalAccounts.findIndex(
            (acc) => acc.address === account.address
          );
          return uncompressAndDecodeExternalData({
            compression: account.data.compression,
            encoding: account.data.encoding,
            account: fetchedExternalAccounts[accountIndex],
            unpackedExternalData:
              unpackedExternalAccounts[accountIndex].unpacked,
          });
        }
      }
    })
  );
}

export function compressData(
  data: ReadonlyUint8Array,
  compression: Compression
): ReadonlyUint8Array {
  switch (compression) {
    case Compression.None:
      return data;
    case Compression.Gzip:
      throw gzip(data as Uint8Array);
    case Compression.Zlib:
      return deflate(data as Uint8Array);
  }
}

export function uncompressData(
  data: ReadonlyUint8Array,
  compression: Compression
): ReadonlyUint8Array {
  switch (compression) {
    case Compression.None:
      return data;
    case Compression.Gzip:
      throw ungzip(data as Uint8Array);
    case Compression.Zlib:
      return inflate(data as Uint8Array);
  }
}

export function encodeData(
  data: string,
  encoding: Encoding
): ReadonlyUint8Array {
  switch (encoding) {
    case Encoding.None:
      return getBase16Encoder().encode(data);
    case Encoding.Utf8:
      return getUtf8Encoder().encode(data);
    case Encoding.Base58:
      return getBase58Encoder().encode(data);
    case Encoding.Base64:
      return getBase64Encoder().encode(data);
  }
}

export function decodeData(
  data: ReadonlyUint8Array,
  encoding: Encoding
): string {
  switch (encoding) {
    case Encoding.None:
      return getBase16Decoder().decode(data);
    case Encoding.Utf8:
      return getUtf8Decoder().decode(data);
    case Encoding.Base58:
      return getBase58Decoder().decode(data);
    case Encoding.Base64:
      return getBase64Decoder().decode(data);
  }
}
