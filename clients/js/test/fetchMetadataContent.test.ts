import { address, generateKeyPairSigner, getUtf8Encoder } from '@solana/kit';
import test from 'ava';
import {
  Compression,
  Encoding,
  fetchAndParseAllMetadataContent,
  fetchAndParseMetadataContent,
  Format,
  packDirectData,
  packExternalData,
  writeMetadata,
} from '../src';
import {
  createBuffer,
  createDefaultSolanaClient,
  createDeployedProgram,
  generateKeyPairSignerWithSol,
} from './_setup';

test('it fetches and parses direct IDLs from canonical metadata accounts', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const [program] = await createDeployedProgram(client, authority);

  // And given the following IDL exists for the program.
  const idl = '{"kind":"rootNode","standard":"codama","version":"1.0.0"}';
  await writeMetadata({
    ...client,
    ...packDirectData({ content: idl }),
    payer: authority,
    authority,
    program,
    seed: 'idl',
    format: Format.Json,
  });

  // When we fetch the canonical IDL for the program.
  const result = await fetchAndParseMetadataContent(client.rpc, program, 'idl');

  // Then we expect the following IDL to be fetched and parsed.
  t.deepEqual(result, {
    kind: 'rootNode',
    standard: 'codama',
    version: '1.0.0',
  });
});

test('it fetches and parses direct IDLs from non-canonical metadata accounts', async (t) => {
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // And given the following IDL exists for the program.
  const idl = '{"kind":"rootNode","standard":"codama","version":"1.0.0"}';
  await writeMetadata({
    ...client,
    ...packDirectData({ content: idl }),
    payer: authority,
    authority,
    program,
    seed: 'idl',
    format: Format.Json,
  });

  // When we fetch the non-canonical IDL for the program.
  const result = await fetchAndParseMetadataContent(
    client.rpc,
    program,
    'idl',
    authority.address
  );

  // Then we expect the following IDL to be fetched and parsed.
  t.deepEqual(result, {
    kind: 'rootNode',
    standard: 'codama',
    version: '1.0.0',
  });
});

test('it fetches and parses multiple direct IDLs from metadata accounts', async (t) => {
  t.timeout(30_000);
  // Given the following authority and deployed program.
  const client = createDefaultSolanaClient();
  const authority = await generateKeyPairSignerWithSol(client);
  const program = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  const metadata1 = await generateKeyPairSigner();
  const metadata2 = await generateKeyPairSigner();

  // And given the following IDLs exist for the programs.
  const idl1 = '{"kind":"rootNode","standard":"codama","version":"1.0.0"}';
  const idl2 = '{"kind":"rootNode","standard":"codama","version":"1.0.1"}';
  const buffer = await generateKeyPairSigner();

  // We create a buffer account to hold the IDL data
  await createBuffer(client, {
    buffer: buffer.address,
    authority: buffer,
    payer: authority,
    data: getUtf8Encoder().encode(idl2),
  });

  // And we create metadata accounts for direct and external data
  await Promise.all([
    writeMetadata({
      ...client,
      ...packDirectData({ content: idl1 }),
      payer: authority,
      authority: metadata1,
      program,
      seed: 'idl',
      format: Format.Json,
    }),
    writeMetadata({
      ...client,
      ...packExternalData({
        address: buffer.address,
        offset: 96,
        length: idl2.length,
        compression: Compression.None,
        encoding: Encoding.Utf8,
      }),
      payer: authority,
      authority: metadata2,
      program,
      seed: 'idl',
      format: Format.Json,
    }),
  ]);

  // When we fetch the IDLs for the programs.
  const result = await fetchAndParseAllMetadataContent(client.rpc, [
    {
      program,
      seed: 'idl',
      authority: metadata1.address,
    },
    {
      program,
      seed: 'idl',
      authority: metadata2.address,
    },
  ]);

  // Then we expect the following IDLs to be fetched and parsed.
  t.deepEqual(result, [
    {
      kind: 'rootNode',
      standard: 'codama',
      version: '1.0.0',
    },
    {
      kind: 'rootNode',
      standard: 'codama',
      version: '1.0.1',
    },
  ]);
});
