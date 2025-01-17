import {
  addDecoderSizePrefix,
  addEncoderSizePrefix,
  combineCodec,
  getBytesDecoder,
  getBytesEncoder,
  getStructDecoder,
  getStructEncoder,
  getU32Decoder,
  getU32Encoder,
  getU64Decoder,
  getU64Encoder,
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
  type ReadonlySignerAccount,
  type ReadonlyUint8Array,
  type TransactionSigner,
  type WritableAccount,
} from '@solana/web3.js';
import { getAccountMetaFactory, type ResolvedAccount } from './shared';
import { LOADER_V3_PROGRAM_ADDRESS } from '../../src';

export const WRITE_DISCRIMINATOR = 1;

export function getWriteDiscriminatorBytes() {
  return getU32Encoder().encode(WRITE_DISCRIMINATOR);
}

export type WriteInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountBufferAccount extends string | IAccountMeta<string> = string,
  TAccountBufferAuthority extends string | IAccountMeta<string> = string,
  TRemainingAccounts extends readonly IAccountMeta<string>[] = [],
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountBufferAccount extends string
        ? WritableAccount<TAccountBufferAccount>
        : TAccountBufferAccount,
      TAccountBufferAuthority extends string
        ? ReadonlySignerAccount<TAccountBufferAuthority> &
            IAccountSignerMeta<TAccountBufferAuthority>
        : TAccountBufferAuthority,
      ...TRemainingAccounts,
    ]
  >;

export type WriteInstructionData = {
  discriminator: number;
  offset: number;
  bytes: ReadonlyUint8Array;
};

export type WriteInstructionDataArgs = {
  offset: number;
  bytes: ReadonlyUint8Array;
};

export function getWriteInstructionDataEncoder(): Encoder<WriteInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', getU32Encoder()],
      ['offset', getU32Encoder()],
      ['bytes', addEncoderSizePrefix(getBytesEncoder(), getU64Encoder())],
    ]),
    (value) => ({ ...value, discriminator: WRITE_DISCRIMINATOR })
  );
}

export function getWriteInstructionDataDecoder(): Decoder<WriteInstructionData> {
  return getStructDecoder([
    ['discriminator', getU32Decoder()],
    ['offset', getU32Decoder()],
    ['bytes', addDecoderSizePrefix(getBytesDecoder(), getU64Decoder())],
  ]);
}

export function getWriteInstructionDataCodec(): Codec<
  WriteInstructionDataArgs,
  WriteInstructionData
> {
  return combineCodec(
    getWriteInstructionDataEncoder(),
    getWriteInstructionDataDecoder()
  );
}

export type WriteInput<
  TAccountBufferAccount extends string = string,
  TAccountBufferAuthority extends string = string,
> = {
  /** Buffer account. */
  bufferAccount: Address<TAccountBufferAccount>;
  /** Buffer authority. */
  bufferAuthority: TransactionSigner<TAccountBufferAuthority>;
  offset: WriteInstructionDataArgs['offset'];
  bytes: WriteInstructionDataArgs['bytes'];
};

export function getWriteInstruction<
  TAccountBufferAccount extends string,
  TAccountBufferAuthority extends string,
>(
  input: WriteInput<TAccountBufferAccount, TAccountBufferAuthority>
): WriteInstruction<
  typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountBufferAccount,
  TAccountBufferAuthority
> {
  // Program address.
  const programAddress = LOADER_V3_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    bufferAccount: { value: input.bufferAccount ?? null, isWritable: true },
    bufferAuthority: {
      value: input.bufferAuthority ?? null,
      isWritable: false,
    },
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
      getAccountMeta(accounts.bufferAccount),
      getAccountMeta(accounts.bufferAuthority),
    ],
    programAddress,
    data: getWriteInstructionDataEncoder().encode(
      args as WriteInstructionDataArgs
    ),
  } as WriteInstruction<
    typeof LOADER_V3_PROGRAM_ADDRESS,
    TAccountBufferAccount,
    TAccountBufferAuthority
  >;

  return instruction;
}

export type ParsedWriteInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /** Buffer account. */
    bufferAccount: TAccountMetas[0];
    /** Buffer authority. */
    bufferAuthority: TAccountMetas[1];
  };
  data: WriteInstructionData;
};

export function parseWriteInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>
): ParsedWriteInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 2) {
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
      bufferAccount: getNextAccount(),
      bufferAuthority: getNextAccount(),
    },
    data: getWriteInstructionDataDecoder().decode(instruction.data),
  };
}
