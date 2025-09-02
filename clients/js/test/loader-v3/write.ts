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
  type AccountMeta,
  type AccountSignerMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlySignerAccount,
  type ReadonlyUint8Array,
  type TransactionSigner,
  type WritableAccount,
} from '@solana/kit';
import { getAccountMetaFactory, type ResolvedAccount } from './shared';
import { LOADER_V3_PROGRAM_ADDRESS } from '../../src';

export const WRITE_DISCRIMINATOR = 1;

export function getWriteDiscriminatorBytes() {
  return getU32Encoder().encode(WRITE_DISCRIMINATOR);
}

export type WriteInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountBufferAccount extends string | AccountMeta<string> = string,
  TAccountBufferAuthority extends string | AccountMeta<string> = string,
  TRemainingAccounts extends readonly AccountMeta<string>[] = [],
> = Instruction<TProgram> &
  InstructionWithData<Uint8Array> &
  InstructionWithAccounts<
    [
      TAccountBufferAccount extends string
        ? WritableAccount<TAccountBufferAccount>
        : TAccountBufferAccount,
      TAccountBufferAuthority extends string
        ? ReadonlySignerAccount<TAccountBufferAuthority> &
            AccountSignerMeta<TAccountBufferAuthority>
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
  TAccountMetas extends readonly AccountMeta[] = readonly AccountMeta[],
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
  TAccountMetas extends readonly AccountMeta[],
>(
  instruction: Instruction<TProgram> &
    InstructionWithAccounts<TAccountMetas> &
    InstructionWithData<Uint8Array>
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
