import {
  combineCodec,
  getStructDecoder,
  getStructEncoder,
  getU32Decoder,
  getU32Encoder,
  transformEncoder,
  type Address,
  type Codec,
  type Decoder,
  type Encoder,
  type AccountMeta,
  type Instruction,
  type InstructionWithAccounts,
  type InstructionWithData,
  type ReadonlyAccount,
  type WritableAccount,
} from '@solana/kit';
import { getAccountMetaFactory, type ResolvedAccount } from './shared';
import { LOADER_V3_PROGRAM_ADDRESS } from '../../src';

export const INITIALIZE_BUFFER_DISCRIMINATOR = 0;

export function getInitializeBufferDiscriminatorBytes() {
  return getU32Encoder().encode(INITIALIZE_BUFFER_DISCRIMINATOR);
}

export type InitializeBufferInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountSourceAccount extends string | AccountMeta<string> = string,
  TAccountBufferAuthority extends string | AccountMeta<string> = string,
  TRemainingAccounts extends readonly AccountMeta<string>[] = [],
> = Instruction<TProgram> &
  InstructionWithData<Uint8Array> &
  InstructionWithAccounts<
    [
      TAccountSourceAccount extends string
        ? WritableAccount<TAccountSourceAccount>
        : TAccountSourceAccount,
      TAccountBufferAuthority extends string
        ? ReadonlyAccount<TAccountBufferAuthority>
        : TAccountBufferAuthority,
      ...TRemainingAccounts,
    ]
  >;

export type InitializeBufferInstructionData = { discriminator: number };

export type InitializeBufferInstructionDataArgs = {};

export function getInitializeBufferInstructionDataEncoder(): Encoder<InitializeBufferInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([['discriminator', getU32Encoder()]]),
    (value) => ({ ...value, discriminator: INITIALIZE_BUFFER_DISCRIMINATOR })
  );
}

export function getInitializeBufferInstructionDataDecoder(): Decoder<InitializeBufferInstructionData> {
  return getStructDecoder([['discriminator', getU32Decoder()]]);
}

export function getInitializeBufferInstructionDataCodec(): Codec<
  InitializeBufferInstructionDataArgs,
  InitializeBufferInstructionData
> {
  return combineCodec(
    getInitializeBufferInstructionDataEncoder(),
    getInitializeBufferInstructionDataDecoder()
  );
}

export type InitializeBufferInput<
  TAccountSourceAccount extends string = string,
  TAccountBufferAuthority extends string = string,
> = {
  /** Source account to initialize. */
  sourceAccount: Address<TAccountSourceAccount>;
  /** Buffer authority. */
  bufferAuthority: Address<TAccountBufferAuthority>;
};

export function getInitializeBufferInstruction<
  TAccountSourceAccount extends string,
  TAccountBufferAuthority extends string,
>(
  input: InitializeBufferInput<TAccountSourceAccount, TAccountBufferAuthority>
): InitializeBufferInstruction<
  typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountSourceAccount,
  TAccountBufferAuthority
> {
  // Program address.
  const programAddress = LOADER_V3_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    sourceAccount: { value: input.sourceAccount ?? null, isWritable: true },
    bufferAuthority: {
      value: input.bufferAuthority ?? null,
      isWritable: false,
    },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');
  const instruction = {
    accounts: [
      getAccountMeta(accounts.sourceAccount),
      getAccountMeta(accounts.bufferAuthority),
    ],
    programAddress,
    data: getInitializeBufferInstructionDataEncoder().encode({}),
  } as InitializeBufferInstruction<
    typeof LOADER_V3_PROGRAM_ADDRESS,
    TAccountSourceAccount,
    TAccountBufferAuthority
  >;

  return instruction;
}

export type ParsedInitializeBufferInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountMetas extends readonly AccountMeta[] = readonly AccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /** Source account to initialize. */
    sourceAccount: TAccountMetas[0];
    /** Buffer authority. */
    bufferAuthority: TAccountMetas[1];
  };
  data: InitializeBufferInstructionData;
};

export function parseInitializeBufferInstruction<
  TProgram extends string,
  TAccountMetas extends readonly AccountMeta[],
>(
  instruction: Instruction<TProgram> &
    InstructionWithAccounts<TAccountMetas> &
    InstructionWithData<Uint8Array>
): ParsedInitializeBufferInstruction<TProgram, TAccountMetas> {
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
      sourceAccount: getNextAccount(),
      bufferAuthority: getNextAccount(),
    },
    data: getInitializeBufferInstructionDataDecoder().decode(instruction.data),
  };
}
