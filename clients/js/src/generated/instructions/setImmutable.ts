/**
 * This code was AUTOGENERATED using the codama library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun codama to update it.
 *
 * @see https://github.com/codama-idl/codama
 */

import {
  combineCodec,
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
  type IAccountSignerMeta,
  type IInstruction,
  type IInstructionWithAccounts,
  type IInstructionWithData,
  type ReadonlyAccount,
  type ReadonlySignerAccount,
  type TransactionSigner,
  type WritableAccount,
} from '@solana/kit';
import { PROGRAM_METADATA_PROGRAM_ADDRESS } from '../programs';
import { getAccountMetaFactory, type ResolvedAccount } from '../shared';

export const SET_IMMUTABLE_DISCRIMINATOR = 4;

export function getSetImmutableDiscriminatorBytes() {
  return getU8Encoder().encode(SET_IMMUTABLE_DISCRIMINATOR);
}

export type SetImmutableInstruction<
  TProgram extends string = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
  TAccountMetadata extends string | IAccountMeta<string> = string,
  TAccountAuthority extends string | IAccountMeta<string> = string,
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
      TAccountProgram extends string
        ? ReadonlyAccount<TAccountProgram>
        : TAccountProgram,
      TAccountProgramData extends string
        ? ReadonlyAccount<TAccountProgramData>
        : TAccountProgramData,
      ...TRemainingAccounts,
    ]
  >;

export type SetImmutableInstructionData = { discriminator: number };

export type SetImmutableInstructionDataArgs = {};

export function getSetImmutableInstructionDataEncoder(): Encoder<SetImmutableInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([['discriminator', getU8Encoder()]]),
    (value) => ({ ...value, discriminator: SET_IMMUTABLE_DISCRIMINATOR })
  );
}

export function getSetImmutableInstructionDataDecoder(): Decoder<SetImmutableInstructionData> {
  return getStructDecoder([['discriminator', getU8Decoder()]]);
}

export function getSetImmutableInstructionDataCodec(): Codec<
  SetImmutableInstructionDataArgs,
  SetImmutableInstructionData
> {
  return combineCodec(
    getSetImmutableInstructionDataEncoder(),
    getSetImmutableInstructionDataDecoder()
  );
}

export type SetImmutableInput<
  TAccountMetadata extends string = string,
  TAccountAuthority extends string = string,
  TAccountProgram extends string = string,
  TAccountProgramData extends string = string,
> = {
  /** Metadata account. */
  metadata: Address<TAccountMetadata>;
  /** Authority account. */
  authority: TransactionSigner<TAccountAuthority>;
  /** Program account. */
  program?: Address<TAccountProgram>;
  /** Program data account. */
  programData?: Address<TAccountProgramData>;
};

export function getSetImmutableInstruction<
  TAccountMetadata extends string,
  TAccountAuthority extends string,
  TAccountProgram extends string,
  TAccountProgramData extends string,
  TProgramAddress extends Address = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
>(
  input: SetImmutableInput<
    TAccountMetadata,
    TAccountAuthority,
    TAccountProgram,
    TAccountProgramData
  >,
  config?: { programAddress?: TProgramAddress }
): SetImmutableInstruction<
  TProgramAddress,
  TAccountMetadata,
  TAccountAuthority,
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
    program: { value: input.program ?? null, isWritable: false },
    programData: { value: input.programData ?? null, isWritable: false },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');
  const instruction = {
    accounts: [
      getAccountMeta(accounts.metadata),
      getAccountMeta(accounts.authority),
      getAccountMeta(accounts.program),
      getAccountMeta(accounts.programData),
    ],
    programAddress,
    data: getSetImmutableInstructionDataEncoder().encode({}),
  } as SetImmutableInstruction<
    TProgramAddress,
    TAccountMetadata,
    TAccountAuthority,
    TAccountProgram,
    TAccountProgramData
  >;

  return instruction;
}

export type ParsedSetImmutableInstruction<
  TProgram extends string = typeof PROGRAM_METADATA_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /** Metadata account. */
    metadata: TAccountMetas[0];
    /** Authority account. */
    authority: TAccountMetas[1];
    /** Program account. */
    program?: TAccountMetas[2] | undefined;
    /** Program data account. */
    programData?: TAccountMetas[3] | undefined;
  };
  data: SetImmutableInstructionData;
};

export function parseSetImmutableInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>
): ParsedSetImmutableInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 4) {
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
      program: getNextOptionalAccount(),
      programData: getNextOptionalAccount(),
    },
    data: getSetImmutableInstructionDataDecoder().decode(instruction.data),
  };
}
