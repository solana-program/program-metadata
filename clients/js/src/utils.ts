import {
  Address,
  assertAccountsExist,
  fetchEncodedAccounts,
  GetAccountInfoApi,
  getAddressDecoder,
  getAddressEncoder,
  GetEpochInfoApi,
  GetLatestBlockhashApi,
  GetMinimumBalanceForRentExemptionApi,
  GetMultipleAccountsApi,
  getProgramDerivedAddress,
  GetSignatureStatusesApi,
  getU32Decoder,
  ReadonlyUint8Array,
  Rpc,
  RpcSubscriptions,
  SendTransactionApi,
  SignatureNotificationsApi,
  SlotNotificationsApi,
  TransactionSigner,
} from '@solana/web3.js';
import {
  CompressionArgs,
  DataSourceArgs,
  EncodingArgs,
  FormatArgs,
  SeedArgs,
} from './generated';

export const ACCOUNT_HEADER_LENGTH = 96;
export const LOADER_V3_PROGRAM_ADDRESS =
  'BPFLoaderUpgradeab1e11111111111111111111111' as Address<'BPFLoaderUpgradeab1e11111111111111111111111'>;

export type MetadataInput = {
  rpc: Rpc<
    GetLatestBlockhashApi &
      GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi &
      GetAccountInfoApi &
      GetMultipleAccountsApi &
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

export async function isProgramAuthority(
  rpc: Rpc<GetMultipleAccountsApi>,
  program: Address,
  programData: Address,
  authority: Address
) {
  // Fetch the program and program data accounts.
  const accounts = await fetchEncodedAccounts(rpc, [program, programData]);
  assertAccountsExist(accounts);
  const [programAccount, programDataAccount] = accounts;

  // Ensure they are valid.
  if (!programAccount.executable) {
    throw Error('Program account must be executable');
  }
  if (programDataAccount.executable) {
    throw Error(
      'The data account associated with the program account must not be executable'
    );
  }
  if (programAccount.programAddress !== programDataAccount.programAddress) {
    throw Error(
      'Program and program data accounts must have the same program owner'
    );
  }
  const u32 = getU32Decoder();
  const programDiscriminator = u32.decode(programAccount.data);
  const programDataDiscriminator = u32.decode(programDataAccount.data);
  if (programDiscriminator !== 2) {
    throw Error('Invalid program discriminator');
  }
  if (programDataDiscriminator !== 3) {
    throw Error('Invalid program data discriminator');
  }
  const expectedProgramDataAddress = getAddressDecoder().decode(
    programAccount.data.slice(4, 36)
  );
  if (expectedProgramDataAddress !== programData) {
    throw Error('Invalid program data address');
  }

  // Get the authority from the program data account.
  if (programDataAccount.data[12] !== 1) {
    return false;
  }
  const expectedAuthority = getAddressDecoder().decode(
    programDataAccount.data.slice(13, 45)
  );
  return expectedAuthority === authority;
}
