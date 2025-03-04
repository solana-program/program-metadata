/**
 * This code was AUTOGENERATED using the codama library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun codama to update it.
 *
 * @see https://github.com/codama-idl/codama
 */

import {
  combineCodec,
  getEnumDecoder,
  getEnumEncoder,
  type Codec,
  type Decoder,
  type Encoder,
} from '@solana/kit';

export enum DataSource {
  Direct,
  Url,
  External,
}

export type DataSourceArgs = DataSource;

export function getDataSourceEncoder(): Encoder<DataSourceArgs> {
  return getEnumEncoder(DataSource);
}

export function getDataSourceDecoder(): Decoder<DataSource> {
  return getEnumDecoder(DataSource);
}

export function getDataSourceCodec(): Codec<DataSourceArgs, DataSource> {
  return combineCodec(getDataSourceEncoder(), getDataSourceDecoder());
}
