import { address } from '@solana/web3.js';
import test from 'ava';
import {
  downloadAndParseMetadata,
  Format,
  packDirectData,
  uploadMetadata,
} from '../src';
import {
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
  await uploadMetadata({
    ...client,
    ...packDirectData({ content: idl }),
    payer: authority,
    authority,
    program,
    seed: 'idl',
    format: Format.Json,
  });

  // When we fetch the canonical IDL for the program.
  const result = await downloadAndParseMetadata(client.rpc, program, 'idl');

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
  await uploadMetadata({
    ...client,
    ...packDirectData({ content: idl }),
    payer: authority,
    authority,
    program,
    seed: 'idl',
    format: Format.Json,
  });

  // When we fetch the non-canonical IDL for the program.
  const result = await downloadAndParseMetadata(
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
