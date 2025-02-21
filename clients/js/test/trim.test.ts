import {
  appendTransactionMessageInstructions,
  BASE_ACCOUNT_SIZE,
  generateKeyPairSigner,
  getUtf8Encoder,
  lamports,
  pipe,
} from '@solana/web3.js';
import test from 'ava';
import {
  AccountDiscriminator,
  Compression,
  DataSource,
  Encoding,
  fetchMetadata,
  Format,
  getSetDataInstruction,
  getTrimInstruction,
  Metadata,
} from '../src';
import {
  createCanonicalMetadata,
  createDefaultSolanaClient,
  createDefaultTransaction,
  createDeployedProgram,
  generateKeyPairSignerWithSol,
  getBalance,
  signAndSendTransaction,
} from './_setup';

test.skip('the program authority of a canonical metadata account can trim it', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const [authority, destination] = await Promise.all([
    generateKeyPairSignerWithSol(client),
    generateKeyPairSigner(),
  ]);
  const [program, programData] = await createDeployedProgram(client, authority);

  // And the following metadata account with 200 bytes of data.
  const data = getUtf8Encoder().encode('x'.repeat(200));
  const [metadata] = await createCanonicalMetadata(client, {
    authority,
    data,
    program,
    programData,
    seed: 'dummy',
  });

  // And given we remove 100 bytes of data.
  const reducedData = getUtf8Encoder().encode('x'.repeat(100));
  const reduceBytesIx = getSetDataInstruction({
    metadata,
    authority,
    encoding: Encoding.None,
    compression: Compression.None,
    format: Format.None,
    dataSource: DataSource.Direct,
    data: reducedData,
    program,
    programData,
  });

  // When we trim the metadata account.
  const trimIx = getTrimInstruction({
    account: metadata,
    authority,
    destination: destination.address,
    program,
    programData,
  });
  await pipe(
    await createDefaultTransaction(client, authority),
    (tx) => appendTransactionMessageInstructions([reduceBytesIx, trimIx], tx),
    (tx) => signAndSendTransaction(client, tx)
  );

  // Then we expect the metadata account to be trimmed.
  const metadataAccount = await fetchMetadata(client.rpc, metadata);
  t.like(metadataAccount.data, <Metadata>{
    discriminator: AccountDiscriminator.Metadata,
    data: reducedData,
  });

  // And we expect the destination account to have the rent difference.
  const rentForHeader = await client.rpc
    .getMinimumBalanceForRentExemption(0n)
    .send();
  const rentDifference = lamports(
    (rentForHeader * (200n - 100n)) / BigInt(BASE_ACCOUNT_SIZE)
  );
  const destinationBalance = await getBalance(client, destination.address);
  t.is(destinationBalance, rentDifference);
});

test.todo('the explicit authority of a canonical metadata account can trim it');

test.todo(
  'the metadata authority of a non-canonical metadata account can trim it'
);
