import {
  Address,
  assertAccountExists,
  EncodedAccount,
  fetchEncodedAccount,
  GetAccountInfoApi,
  getAddressDecoder,
  getAddressEncoder,
  getOptionDecoder,
  getProgramDerivedAddress,
  getStructDecoder,
  getU32Decoder,
  getU64Decoder,
  MicroLamports,
  ReadonlyUint8Array,
  Rpc,
  TransactionSigner,
  unwrapOption,
} from '@solana/kit';
import {
  CompressionArgs,
  DataSourceArgs,
  EncodingArgs,
  FormatArgs,
  getExtendInstruction,
  getWriteInstruction,
  SeedArgs,
} from './generated';
import {
  getLinearIterableInstructionPlan,
  getReallocIterableInstructionPlan,
  IterableInstructionPlan,
  TransactionPlanResult,
} from './instructionPlans';

export const ACCOUNT_HEADER_LENGTH = 96;

export const LOADER_V1_PROGRAM_ADDRESS =
  'BPFLoader1111111111111111111111111111111111' as Address<'BPFLoader1111111111111111111111111111111111'>;
export const LOADER_V2_PROGRAM_ADDRESS =
  'BPFLoader2111111111111111111111111111111111' as Address<'BPFLoader2111111111111111111111111111111111'>;
export const LOADER_V3_PROGRAM_ADDRESS =
  'BPFLoaderUpgradeab1e11111111111111111111111' as Address<'BPFLoaderUpgradeab1e11111111111111111111111'>;
export const LOADER_V4_PROGRAM_ADDRESS =
  'CoreBPFLoaderV41111111111111111111111111111' as Address<'CoreBPFLoaderV41111111111111111111111111111'>;

export type MetadataInput = {
  payer: TransactionSigner;
  authority: TransactionSigner;
  program: Address;
  seed: SeedArgs;
  encoding: EncodingArgs;
  compression: CompressionArgs;
  format: FormatArgs;
  dataSource: DataSourceArgs;
  data?: ReadonlyUint8Array;
  buffer?: Address;
  /**
   * Extra fees to pay in microlamports per CU.
   * Defaults to no extra fees.
   */
  priorityFees?: MicroLamports;
  /**
   * When using a buffer, whether to close the buffer account after the operation.
   * If an address is provided, it will be used as the destination for the close instruction.
   * Defaults to `true`.
   */
  closeBuffer?: Address | boolean;
};

export type MetadataResponse = {
  metadata: Address;
  result: TransactionPlanResult;
};

export function getAccountSize(dataLength: bigint | number) {
  return BigInt(ACCOUNT_HEADER_LENGTH) + BigInt(dataLength);
}

export async function getProgramDataPda(program: Address) {
  return await getProgramDerivedAddress({
    programAddress: LOADER_V3_PROGRAM_ADDRESS,
    seeds: [getAddressEncoder().encode(program)],
  });
}

export async function getProgramAuthority(
  rpc: Rpc<GetAccountInfoApi>,
  program: Address
): Promise<{ authority?: Address; programData?: Address }> {
  // Fetch the program account.
  const programAccount = await fetchEncodedAccount(rpc, program);
  assertAccountExists(programAccount);

  // Ensure the program is executable.
  if (!programAccount.executable) {
    throw Error('Program account must be executable');
  }

  // Check all the loader programs.
  switch (programAccount.programAddress) {
    case LOADER_V1_PROGRAM_ADDRESS:
    case LOADER_V2_PROGRAM_ADDRESS:
      return { authority: program };
    case LOADER_V3_PROGRAM_ADDRESS:
      return await getProgramAuthorityForLoaderV3(rpc, programAccount);
    case LOADER_V4_PROGRAM_ADDRESS:
    default:
      throw new Error(
        'Unsupported loader program: ' + programAccount.programAddress
      );
  }
}

async function getProgramAuthorityForLoaderV3(
  rpc: Rpc<GetAccountInfoApi>,
  programAccount: EncodedAccount
) {
  if (programAccount.programAddress !== LOADER_V3_PROGRAM_ADDRESS) {
    throw Error('Invalid loader program, expected loader v3');
  }

  // Fetch the program data account.
  const [programData] = await getProgramDataPda(programAccount.address);
  const programDataAccount = await fetchEncodedAccount(rpc, programData);
  assertAccountExists(programDataAccount);

  // Ensure the program data account is not executable.
  if (programDataAccount.executable) {
    throw Error(
      'The data account associated with the program account must not be executable'
    );
  }

  // Decode the program and program data accounts.
  const [programDecoder, programDataDecoder] = getLoaderV3Decoders();
  const programAccountData = programDecoder.decode(programAccount.data);
  const programDataAccountData = programDataDecoder.decode(
    programDataAccount.data
  );

  // Ensure both accounts are valid.
  if (programAccountData.discriminator !== 2) {
    throw Error('Invalid program discriminator');
  }
  if (programDataAccountData.discriminator !== 3) {
    throw Error('Invalid program data discriminator');
  }
  if (programAccountData.programData !== programDataAccount.address) {
    throw Error('Invalid associated program data address');
  }

  return {
    authority: unwrapOption(programDataAccountData.authority) ?? undefined,
    programData,
  };
}

function getLoaderV3Decoders() {
  return [
    getStructDecoder([
      ['discriminator', getU32Decoder()],
      ['programData', getAddressDecoder()],
    ]),
    getStructDecoder([
      ['discriminator', getU32Decoder()],
      ['slot', getU64Decoder()],
      ['authority', getOptionDecoder(getAddressDecoder())],
    ]),
  ] as const;
}

export function getExtendInstructionPlan(input: {
  account: Address;
  authority: TransactionSigner;
  extraLength: number;
  program?: Address;
  programData?: Address;
}): IterableInstructionPlan {
  return getReallocIterableInstructionPlan({
    totalSize: input.extraLength,
    getInstruction: (size) =>
      getExtendInstruction({
        account: input.account,
        authority: input.authority,
        length: size,
        program: input.program,
        programData: input.programData,
      }),
  });
}

export function getWriteInstructionPlan(input: {
  buffer: Address;
  authority: TransactionSigner;
  data: ReadonlyUint8Array;
}): IterableInstructionPlan {
  return getLinearIterableInstructionPlan({
    totalLength: input.data.length,
    getInstruction: (offset, length) =>
      getWriteInstruction({
        buffer: input.buffer,
        authority: input.authority,
        offset,
        data: input.data.slice(offset, offset + length),
      }),
  });
}
