import {
  combineCodec,
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
  type ReadonlyAccount,
  type ReadonlySignerAccount,
  type TransactionSigner,
  type WritableAccount,
  type WritableSignerAccount,
} from '@solana/web3.js';
import { getAccountMetaFactory, type ResolvedAccount } from './shared';
import { LOADER_V3_PROGRAM_ADDRESS } from '../../src';

export const DEPLOY_WITH_MAX_DATA_LEN_DISCRIMINATOR = 2;

export function getDeployWithMaxDataLenDiscriminatorBytes() {
  return getU32Encoder().encode(DEPLOY_WITH_MAX_DATA_LEN_DISCRIMINATOR);
}

export type DeployWithMaxDataLenInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountPayerAccount extends string | IAccountMeta<string> = string,
  TAccountProgramDataAccount extends string | IAccountMeta<string> = string,
  TAccountProgramAccount extends string | IAccountMeta<string> = string,
  TAccountBufferAccount extends string | IAccountMeta<string> = string,
  TAccountRentSysvar extends
    | string
    | IAccountMeta<string> = 'SysvarRent111111111111111111111111111111111',
  TAccountClockSysvar extends
    | string
    | IAccountMeta<string> = 'SysvarC1ock11111111111111111111111111111111',
  TAccountSystemProgram extends
    | string
    | IAccountMeta<string> = '11111111111111111111111111111111',
  TAccountAuthority extends string | IAccountMeta<string> = string,
  TRemainingAccounts extends readonly IAccountMeta<string>[] = [],
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountPayerAccount extends string
        ? WritableSignerAccount<TAccountPayerAccount> &
            IAccountSignerMeta<TAccountPayerAccount>
        : TAccountPayerAccount,
      TAccountProgramDataAccount extends string
        ? WritableAccount<TAccountProgramDataAccount>
        : TAccountProgramDataAccount,
      TAccountProgramAccount extends string
        ? WritableAccount<TAccountProgramAccount>
        : TAccountProgramAccount,
      TAccountBufferAccount extends string
        ? WritableAccount<TAccountBufferAccount>
        : TAccountBufferAccount,
      TAccountRentSysvar extends string
        ? ReadonlyAccount<TAccountRentSysvar>
        : TAccountRentSysvar,
      TAccountClockSysvar extends string
        ? ReadonlyAccount<TAccountClockSysvar>
        : TAccountClockSysvar,
      TAccountSystemProgram extends string
        ? ReadonlyAccount<TAccountSystemProgram>
        : TAccountSystemProgram,
      TAccountAuthority extends string
        ? ReadonlySignerAccount<TAccountAuthority> &
            IAccountSignerMeta<TAccountAuthority>
        : TAccountAuthority,
      ...TRemainingAccounts,
    ]
  >;

export type DeployWithMaxDataLenInstructionData = {
  discriminator: number;
  maxDataLen: bigint;
};

export type DeployWithMaxDataLenInstructionDataArgs = {
  maxDataLen: number | bigint;
};

export function getDeployWithMaxDataLenInstructionDataEncoder(): Encoder<DeployWithMaxDataLenInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', getU32Encoder()],
      ['maxDataLen', getU64Encoder()],
    ]),
    (value) => ({
      ...value,
      discriminator: DEPLOY_WITH_MAX_DATA_LEN_DISCRIMINATOR,
    })
  );
}

export function getDeployWithMaxDataLenInstructionDataDecoder(): Decoder<DeployWithMaxDataLenInstructionData> {
  return getStructDecoder([
    ['discriminator', getU32Decoder()],
    ['maxDataLen', getU64Decoder()],
  ]);
}

export function getDeployWithMaxDataLenInstructionDataCodec(): Codec<
  DeployWithMaxDataLenInstructionDataArgs,
  DeployWithMaxDataLenInstructionData
> {
  return combineCodec(
    getDeployWithMaxDataLenInstructionDataEncoder(),
    getDeployWithMaxDataLenInstructionDataDecoder()
  );
}

export type DeployWithMaxDataLenInput<
  TAccountPayerAccount extends string = string,
  TAccountProgramDataAccount extends string = string,
  TAccountProgramAccount extends string = string,
  TAccountBufferAccount extends string = string,
  TAccountRentSysvar extends string = string,
  TAccountClockSysvar extends string = string,
  TAccountSystemProgram extends string = string,
  TAccountAuthority extends string = string,
> = {
  /** Payer account that will pay to create the ProgramData account. */
  payerAccount: TransactionSigner<TAccountPayerAccount>;
  /** ProgramData account (uninitialized). */
  programDataAccount: Address<TAccountProgramDataAccount>;
  /** Program account (uninitialized). */
  programAccount: Address<TAccountProgramAccount>;
  /** Buffer account where the program data has been written. */
  bufferAccount: Address<TAccountBufferAccount>;
  /** Rent sysvar. */
  rentSysvar?: Address<TAccountRentSysvar>;
  /** Clock sysvar. */
  clockSysvar?: Address<TAccountClockSysvar>;
  /** System program. */
  systemProgram?: Address<TAccountSystemProgram>;
  /** Authority. */
  authority: TransactionSigner<TAccountAuthority>;
  maxDataLen: DeployWithMaxDataLenInstructionDataArgs['maxDataLen'];
};

export function getDeployWithMaxDataLenInstruction<
  TAccountPayerAccount extends string,
  TAccountProgramDataAccount extends string,
  TAccountProgramAccount extends string,
  TAccountBufferAccount extends string,
  TAccountRentSysvar extends string,
  TAccountClockSysvar extends string,
  TAccountSystemProgram extends string,
  TAccountAuthority extends string,
>(
  input: DeployWithMaxDataLenInput<
    TAccountPayerAccount,
    TAccountProgramDataAccount,
    TAccountProgramAccount,
    TAccountBufferAccount,
    TAccountRentSysvar,
    TAccountClockSysvar,
    TAccountSystemProgram,
    TAccountAuthority
  >
): DeployWithMaxDataLenInstruction<
  typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountPayerAccount,
  TAccountProgramDataAccount,
  TAccountProgramAccount,
  TAccountBufferAccount,
  TAccountRentSysvar,
  TAccountClockSysvar,
  TAccountSystemProgram,
  TAccountAuthority
> {
  // Program address.
  const programAddress = LOADER_V3_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    payerAccount: { value: input.payerAccount ?? null, isWritable: true },
    programDataAccount: {
      value: input.programDataAccount ?? null,
      isWritable: true,
    },
    programAccount: { value: input.programAccount ?? null, isWritable: true },
    bufferAccount: { value: input.bufferAccount ?? null, isWritable: true },
    rentSysvar: { value: input.rentSysvar ?? null, isWritable: false },
    clockSysvar: { value: input.clockSysvar ?? null, isWritable: false },
    systemProgram: { value: input.systemProgram ?? null, isWritable: false },
    authority: { value: input.authority ?? null, isWritable: false },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Original args.
  const args = { ...input };

  // Resolve default values.
  if (!accounts.rentSysvar.value) {
    accounts.rentSysvar.value =
      'SysvarRent111111111111111111111111111111111' as Address<'SysvarRent111111111111111111111111111111111'>;
  }
  if (!accounts.clockSysvar.value) {
    accounts.clockSysvar.value =
      'SysvarC1ock11111111111111111111111111111111' as Address<'SysvarC1ock11111111111111111111111111111111'>;
  }
  if (!accounts.systemProgram.value) {
    accounts.systemProgram.value =
      '11111111111111111111111111111111' as Address<'11111111111111111111111111111111'>;
  }

  const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');
  const instruction = {
    accounts: [
      getAccountMeta(accounts.payerAccount),
      getAccountMeta(accounts.programDataAccount),
      getAccountMeta(accounts.programAccount),
      getAccountMeta(accounts.bufferAccount),
      getAccountMeta(accounts.rentSysvar),
      getAccountMeta(accounts.clockSysvar),
      getAccountMeta(accounts.systemProgram),
      getAccountMeta(accounts.authority),
    ],
    programAddress,
    data: getDeployWithMaxDataLenInstructionDataEncoder().encode(
      args as DeployWithMaxDataLenInstructionDataArgs
    ),
  } as DeployWithMaxDataLenInstruction<
    typeof LOADER_V3_PROGRAM_ADDRESS,
    TAccountPayerAccount,
    TAccountProgramDataAccount,
    TAccountProgramAccount,
    TAccountBufferAccount,
    TAccountRentSysvar,
    TAccountClockSysvar,
    TAccountSystemProgram,
    TAccountAuthority
  >;

  return instruction;
}

export type ParsedDeployWithMaxDataLenInstruction<
  TProgram extends string = typeof LOADER_V3_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /** Payer account that will pay to create the ProgramData account. */
    payerAccount: TAccountMetas[0];
    /** ProgramData account (uninitialized). */
    programDataAccount: TAccountMetas[1];
    /** Program account (uninitialized). */
    programAccount: TAccountMetas[2];
    /** Buffer account where the program data has been written. */
    bufferAccount: TAccountMetas[3];
    /** Rent sysvar. */
    rentSysvar: TAccountMetas[4];
    /** Clock sysvar. */
    clockSysvar: TAccountMetas[5];
    /** System program. */
    systemProgram: TAccountMetas[6];
    /** Authority. */
    authority: TAccountMetas[7];
  };
  data: DeployWithMaxDataLenInstructionData;
};

export function parseDeployWithMaxDataLenInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>
): ParsedDeployWithMaxDataLenInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 8) {
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
      payerAccount: getNextAccount(),
      programDataAccount: getNextAccount(),
      programAccount: getNextAccount(),
      bufferAccount: getNextAccount(),
      rentSysvar: getNextAccount(),
      clockSysvar: getNextAccount(),
      systemProgram: getNextAccount(),
      authority: getNextAccount(),
    },
    data: getDeployWithMaxDataLenInstructionDataDecoder().decode(
      instruction.data
    ),
  };
}
