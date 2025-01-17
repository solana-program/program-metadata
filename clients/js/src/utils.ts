import {
  Address,
  assertAccountExists,
  EncodedAccount,
  fetchEncodedAccount,
  GetAccountInfoApi,
  getAddressDecoder,
  getAddressEncoder,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetMinimumBalanceForRentExemptionApi,
  getOptionDecoder,
  getProgramDerivedAddress,
  GetSignatureStatusesApi,
  getStructDecoder,
  getU32Decoder,
  getU64Decoder,
  ReadonlyUint8Array,
  Rpc,
  RpcSubscriptions,
  SendTransactionApi,
  SignatureNotificationsApi,
  SlotNotificationsApi,
  TransactionSigner,
  unwrapOption,
} from '@solana/web3.js';
import {
  CompressionArgs,
  DataSourceArgs,
  EncodingArgs,
  FormatArgs,
  SeedArgs,
} from './generated';

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
  rpc: Rpc<
    GetLatestBlockhashApi &
      GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi &
      GetAccountInfoApi &
      GetMinimumBalanceForRentExemptionApi
  >;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
  payer: TransactionSigner;
  authority: TransactionSigner;
  program: Address;
  seed: SeedArgs;
  encoding: EncodingArgs;
  compression: CompressionArgs;
  format: FormatArgs;
  dataSource: DataSourceArgs;
  data: ReadonlyUint8Array;
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
