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
  transformEncoder,
  type Address,
  type Codec,
  type Decoder,
  type Encoder,
  type IAccountMeta,
  type IInstruction,
  type IInstructionWithAccounts,
  type IInstructionWithData,
  type Option,
  type OptionOrNullable,
  type ReadonlyAccount,
  type ReadonlyUint8Array,
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
  getSeedDecoder,
  getSeedEncoder,
  type Compression,
  type CompressionArgs,
  type DataSource,
  type DataSourceArgs,
  type Encoding,
  type EncodingArgs,
  type Format,
  type FormatArgs,
  type Seed,
  type SeedArgs,
} from '../types';

export const INITIALIZE_DISCRIMINATOR = 1;

export function getInitializeDiscriminatorBytes() {
  return getU8Encoder().encode(INITIALIZE_DISCRIMINATOR);
}

export type InitializeInstruction<
  TProgram extends string = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
  TAccountMetadata extends string | IAccountMeta<string> = string,
  TAccountAuthority extends string | IAccountMeta<string> = string,
  TAccountProgram extends string | IAccountMeta<string> = string,
  TAccountProgramData extends string | IAccountMeta<string> = string,
  TAccountSystem extends string | IAccountMeta<string> = string,
  TRemainingAccounts extends readonly IAccountMeta<string>[] = [],
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountMetadata extends string
        ? ReadonlyAccount<TAccountMetadata>
        : TAccountMetadata,
      TAccountAuthority extends string
        ? ReadonlyAccount<TAccountAuthority>
        : TAccountAuthority,
      TAccountProgram extends string
        ? ReadonlyAccount<TAccountProgram>
        : TAccountProgram,
      TAccountProgramData extends string
        ? ReadonlyAccount<TAccountProgramData>
        : TAccountProgramData,
      TAccountSystem extends string
        ? ReadonlyAccount<TAccountSystem>
        : TAccountSystem,
      ...TRemainingAccounts,
    ]
  >;

export type InitializeInstructionData = {
  discriminator: number;
  seed: Seed;
  encoding: Encoding;
  compression: Compression;
  format: Format;
  dataSource: DataSource;
  data: Option<ReadonlyUint8Array>;
};

export type InitializeInstructionDataArgs = {
  seed: SeedArgs;
  encoding: EncodingArgs;
  compression: CompressionArgs;
  format: FormatArgs;
  dataSource: DataSourceArgs;
  data: OptionOrNullable<ReadonlyUint8Array>;
};

export function getInitializeInstructionDataEncoder(): Encoder<InitializeInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', getU8Encoder()],
      ['seed', getSeedEncoder()],
      ['encoding', getEncodingEncoder()],
      ['compression', getCompressionEncoder()],
      ['format', getFormatEncoder()],
      ['dataSource', getDataSourceEncoder()],
      ['data', getOptionEncoder(getBytesEncoder(), { prefix: null })],
    ]),
    (value) => ({ ...value, discriminator: INITIALIZE_DISCRIMINATOR })
  );
}

export function getInitializeInstructionDataDecoder(): Decoder<InitializeInstructionData> {
  return getStructDecoder([
    ['discriminator', getU8Decoder()],
    ['seed', getSeedDecoder()],
    ['encoding', getEncodingDecoder()],
    ['compression', getCompressionDecoder()],
    ['format', getFormatDecoder()],
    ['dataSource', getDataSourceDecoder()],
    ['data', getOptionDecoder(getBytesDecoder(), { prefix: null })],
  ]);
}

export function getInitializeInstructionDataCodec(): Codec<
  InitializeInstructionDataArgs,
  InitializeInstructionData
> {
  return combineCodec(
    getInitializeInstructionDataEncoder(),
    getInitializeInstructionDataDecoder()
  );
}

export type InitializeInput<
  TAccountMetadata extends string = string,
  TAccountAuthority extends string = string,
  TAccountProgram extends string = string,
  TAccountProgramData extends string = string,
  TAccountSystem extends string = string,
> = {
  /** Metadata account the initialize. */
  metadata: Address<TAccountMetadata>;
  /** Authority (for canonical, must match program upgrade authority). */
  authority: Address<TAccountAuthority>;
  /** Program account. */
  program: Address<TAccountProgram>;
  /** Program account. */
  programData: Address<TAccountProgramData>;
  /** System program. */
  system: Address<TAccountSystem>;
  seed: InitializeInstructionDataArgs['seed'];
  encoding: InitializeInstructionDataArgs['encoding'];
  compression: InitializeInstructionDataArgs['compression'];
  format: InitializeInstructionDataArgs['format'];
  dataSource: InitializeInstructionDataArgs['dataSource'];
  data: InitializeInstructionDataArgs['data'];
};

export function getInitializeInstruction<
  TAccountMetadata extends string,
  TAccountAuthority extends string,
  TAccountProgram extends string,
  TAccountProgramData extends string,
  TAccountSystem extends string,
  TProgramAddress extends Address = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
>(
  input: InitializeInput<
    TAccountMetadata,
    TAccountAuthority,
    TAccountProgram,
    TAccountProgramData,
    TAccountSystem
  >,
  config?: { programAddress?: TProgramAddress }
): InitializeInstruction<
  TProgramAddress,
  TAccountMetadata,
  TAccountAuthority,
  TAccountProgram,
  TAccountProgramData,
  TAccountSystem
> {
  // Program address.
  const programAddress =
    config?.programAddress ?? PROGRAM_METADATA_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    metadata: { value: input.metadata ?? null, isWritable: false },
    authority: { value: input.authority ?? null, isWritable: false },
    program: { value: input.program ?? null, isWritable: false },
    programData: { value: input.programData ?? null, isWritable: false },
    system: { value: input.system ?? null, isWritable: false },
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
      getAccountMeta(accounts.program),
      getAccountMeta(accounts.programData),
      getAccountMeta(accounts.system),
    ],
    programAddress,
    data: getInitializeInstructionDataEncoder().encode(
      args as InitializeInstructionDataArgs
    ),
  } as InitializeInstruction<
    TProgramAddress,
    TAccountMetadata,
    TAccountAuthority,
    TAccountProgram,
    TAccountProgramData,
    TAccountSystem
  >;

  return instruction;
}

export type ParsedInitializeInstruction<
  TProgram extends string = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /** Metadata account the initialize. */
    metadata: TAccountMetas[0];
    /** Authority (for canonical, must match program upgrade authority). */
    authority: TAccountMetas[1];
    /** Program account. */
    program: TAccountMetas[2];
    /** Program account. */
    programData: TAccountMetas[3];
    /** System program. */
    system: TAccountMetas[4];
  };
  data: InitializeInstructionData;
};

export function parseInitializeInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>
): ParsedInitializeInstruction<TProgram, TAccountMetas> {
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
  return {
    programAddress: instruction.programAddress,
    accounts: {
      metadata: getNextAccount(),
      authority: getNextAccount(),
      program: getNextAccount(),
      programData: getNextAccount(),
      system: getNextAccount(),
    },
    data: getInitializeInstructionDataDecoder().decode(instruction.data),
  };
}
