/**
 * This code was AUTOGENERATED using the codama library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun codama to update it.
 *
 * @see https://github.com/codama-idl/codama
 */

import {
  combineCodec,
  getBytesDecoder,
  getBytesEncoder,
  getOptionDecoder,
  getOptionEncoder,
  getStructDecoder,
  getStructEncoder,
  getU8Decoder,
  getU8Encoder,
  none,
  transformEncoder,
  type Address,
  type Codec,
  type Decoder,
  type Encoder,
  type IAccountMeta,
  type IAccountSignerMeta,
  type IInstruction,
  type IInstructionWithAccounts,
  type IInstructionWithData,
  type Option,
  type OptionOrNullable,
  type ReadonlyAccount,
  type ReadonlySignerAccount,
  type ReadonlyUint8Array,
  type TransactionSigner,
  type WritableAccount,
} from '@solana/web3.js';
import { PROGRAM_METADATA_PROGRAM_ADDRESS } from '../programs';
import { getAccountMetaFactory, type ResolvedAccount } from '../shared';
import {
  getCompressionDecoder,
  getCompressionEncoder,
  getDataSourceDecoder,
  getDataSourceEncoder,
  getEncodingDecoder,
  getEncodingEncoder,
  getFormatDecoder,
  getFormatEncoder,
  type Compression,
  type CompressionArgs,
  type DataSource,
  type DataSourceArgs,
  type Encoding,
  type EncodingArgs,
  type Format,
  type FormatArgs,
} from '../types';

export const SET_DATA_DISCRIMINATOR = 3;

export function getSetDataDiscriminatorBytes() {
  return getU8Encoder().encode(SET_DATA_DISCRIMINATOR);
}

export type SetDataInstruction<
  TProgram extends string = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
  TAccountMetadata extends string | IAccountMeta<string> = string,
  TAccountAuthority extends string | IAccountMeta<string> = string,
  TAccountBuffer extends string | IAccountMeta<string> = string,
  TAccountProgram extends string | IAccountMeta<string> = string,
  TAccountProgramData extends string | IAccountMeta<string> = string,
  TRemainingAccounts extends readonly IAccountMeta<string>[] = [],
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountMetadata extends string
        ? WritableAccount<TAccountMetadata>
        : TAccountMetadata,
      TAccountAuthority extends string
        ? ReadonlySignerAccount<TAccountAuthority> &
            IAccountSignerMeta<TAccountAuthority>
        : TAccountAuthority,
      TAccountBuffer extends string
        ? WritableAccount<TAccountBuffer>
        : TAccountBuffer,
      TAccountProgram extends string
        ? ReadonlyAccount<TAccountProgram>
        : TAccountProgram,
      TAccountProgramData extends string
        ? ReadonlyAccount<TAccountProgramData>
        : TAccountProgramData,
      ...TRemainingAccounts,
    ]
  >;

export type SetDataInstructionData = {
  discriminator: number;
  encoding: Encoding;
  compression: Compression;
  format: Format;
  dataSource: DataSource;
  data: Option<ReadonlyUint8Array>;
};

export type SetDataInstructionDataArgs = {
  encoding: EncodingArgs;
  compression: CompressionArgs;
  format: FormatArgs;
  dataSource: DataSourceArgs;
  data?: OptionOrNullable<ReadonlyUint8Array>;
};

export function getSetDataInstructionDataEncoder(): Encoder<SetDataInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', getU8Encoder()],
      ['encoding', getEncodingEncoder()],
      ['compression', getCompressionEncoder()],
      ['format', getFormatEncoder()],
      ['dataSource', getDataSourceEncoder()],
      ['data', getOptionEncoder(getBytesEncoder(), { prefix: null })],
    ]),
    (value) => ({
      ...value,
      discriminator: SET_DATA_DISCRIMINATOR,
      data: value.data ?? none(),
    })
  );
}

export function getSetDataInstructionDataDecoder(): Decoder<SetDataInstructionData> {
  return getStructDecoder([
    ['discriminator', getU8Decoder()],
    ['encoding', getEncodingDecoder()],
    ['compression', getCompressionDecoder()],
    ['format', getFormatDecoder()],
    ['dataSource', getDataSourceDecoder()],
    ['data', getOptionDecoder(getBytesDecoder(), { prefix: null })],
  ]);
}

export function getSetDataInstructionDataCodec(): Codec<
  SetDataInstructionDataArgs,
  SetDataInstructionData
> {
  return combineCodec(
    getSetDataInstructionDataEncoder(),
    getSetDataInstructionDataDecoder()
  );
}

export type SetDataInput<
  TAccountMetadata extends string = string,
  TAccountAuthority extends string = string,
  TAccountBuffer extends string = string,
  TAccountProgram extends string = string,
  TAccountProgramData extends string = string,
> = {
  /** Metadata account. */
  metadata: Address<TAccountMetadata>;
  /** Authority account. */
  authority: TransactionSigner<TAccountAuthority>;
  /** Buffer account to copy data from. */
  buffer?: Address<TAccountBuffer>;
  /** Program account. */
  program?: Address<TAccountProgram>;
  /** Program data account. */
  programData?: Address<TAccountProgramData>;
  encoding: SetDataInstructionDataArgs['encoding'];
  compression: SetDataInstructionDataArgs['compression'];
  format: SetDataInstructionDataArgs['format'];
  dataSource: SetDataInstructionDataArgs['dataSource'];
  data?: SetDataInstructionDataArgs['data'];
};

export function getSetDataInstruction<
  TAccountMetadata extends string,
  TAccountAuthority extends string,
  TAccountBuffer extends string,
  TAccountProgram extends string,
  TAccountProgramData extends string,
  TProgramAddress extends Address = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
>(
  input: SetDataInput<
    TAccountMetadata,
    TAccountAuthority,
    TAccountBuffer,
    TAccountProgram,
    TAccountProgramData
  >,
  config?: { programAddress?: TProgramAddress }
): SetDataInstruction<
  TProgramAddress,
  TAccountMetadata,
  TAccountAuthority,
  TAccountBuffer,
  TAccountProgram,
  TAccountProgramData
> {
  // Program address.
  const programAddress =
    config?.programAddress ?? PROGRAM_METADATA_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    metadata: { value: input.metadata ?? null, isWritable: true },
    authority: { value: input.authority ?? null, isWritable: false },
    buffer: { value: input.buffer ?? null, isWritable: true },
    program: { value: input.program ?? null, isWritable: false },
    programData: { value: input.programData ?? null, isWritable: false },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Original args.
  const args = { ...input };

  const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');
  const instruction = {
    accounts: [
      getAccountMeta(accounts.metadata),
      getAccountMeta(accounts.authority),
      getAccountMeta(accounts.buffer),
      getAccountMeta(accounts.program),
      getAccountMeta(accounts.programData),
    ],
    programAddress,
    data: getSetDataInstructionDataEncoder().encode(
      args as SetDataInstructionDataArgs
    ),
  } as SetDataInstruction<
    TProgramAddress,
    TAccountMetadata,
    TAccountAuthority,
    TAccountBuffer,
    TAccountProgram,
    TAccountProgramData
  >;

  return instruction;
}

export type ParsedSetDataInstruction<
  TProgram extends string = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /** Metadata account. */
    metadata: TAccountMetas[0];
    /** Authority account. */
    authority: TAccountMetas[1];
    /** Buffer account to copy data from. */
    buffer?: TAccountMetas[2] | undefined;
    /** Program account. */
    program?: TAccountMetas[3] | undefined;
    /** Program data account. */
    programData?: TAccountMetas[4] | undefined;
  };
  data: SetDataInstructionData;
};

export function parseSetDataInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>
): ParsedSetDataInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 5) {
    // TODO: Coded error.
    throw new Error('Not enough accounts');
  }
  let accountIndex = 0;
  const getNextAccount = () => {
    const accountMeta = instruction.accounts![accountIndex]!;
    accountIndex += 1;
    return accountMeta;
  };
  const getNextOptionalAccount = () => {
    const accountMeta = getNextAccount();
    return accountMeta.address === PROGRAM_METADATA_PROGRAM_ADDRESS
      ? undefined
      : accountMeta;
  };
  return {
    programAddress: instruction.programAddress,
    accounts: {
      metadata: getNextAccount(),
      authority: getNextAccount(),
      buffer: getNextOptionalAccount(),
      program: getNextOptionalAccount(),
      programData: getNextOptionalAccount(),
    },
    data: getSetDataInstructionDataDecoder().decode(instruction.data),
  };
}
