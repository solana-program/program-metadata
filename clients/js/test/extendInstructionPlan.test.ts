import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import {
    Address,
    flattenTransactionPlan,
    generateKeyPairSigner,
    getUtf8Encoder,
    InstructionPlan,
    TransactionMessage,
} from '@solana/kit';
import { expect, it } from 'vitest';

import {
    ACCOUNT_HEADER_LENGTH,
    Compression,
    DataSource,
    Encoding,
    findCanonicalPda,
    Format,
    getCreateMetadataInstructionPlanUsingExistingBuffer,
    getCreateMetadataInstructionPlanUsingNewBuffer,
    getExtendInstructionPlan,
    parseProgramMetadataInstruction,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
    ProgramMetadataInstruction,
} from '../src';
import {
    createDeployedProgram,
    createTestClient,
    generateKeyPairSignerWithSol,
    REALLOC_LIMIT,
    TestClient,
} from './_setup';

it('packs several extend instructions per transaction by default', async () => {
    // Given an extend plan growing an account by more than two realloc limits.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const account = (await findCanonicalPda({ program: authority.address, seed: 'idl' }))[0];
    const plan = getExtendInstructionPlan({ account, authority, extraLength: 25_000 });

    // When we plan it into transactions.
    const messages = await planMessages(client, plan);

    // Then all extend instructions fit into a single transaction, each bounded by the realloc limit.
    expect(messages).toHaveLength(1);
    expect(getExtendLengths(messages[0], account)).toEqual([REALLOC_LIMIT, REALLOC_LIMIT, 25_000 - 2 * REALLOC_LIMIT]);
});

it('covers the full length when it is an exact multiple of the realloc limit', async () => {
    // Given an extend plan whose length is exactly two realloc limits.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const account = (await findCanonicalPda({ program: authority.address, seed: 'idl' }))[0];
    const plan = getExtendInstructionPlan({ account, authority, extraLength: 2 * REALLOC_LIMIT });

    // When we plan it into transactions.
    const messages = await planMessages(client, plan);

    // Then we expect exactly two full extend instructions and no empty one.
    expect(messages).toHaveLength(1);
    expect(getExtendLengths(messages[0], account)).toEqual([REALLOC_LIMIT, REALLOC_LIMIT]);
});

it('packs at most one extend instruction per transaction when requested', async () => {
    // Given an extend plan growing an account by more than two realloc limits,
    // constrained to a single extend instruction per transaction.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const account = (await findCanonicalPda({ program: authority.address, seed: 'idl' }))[0];
    const plan = getExtendInstructionPlan({
        account,
        authority,
        extraLength: 25_000,
        singleExtendPerTransaction: true,
    });

    // When we plan it into transactions.
    const messages = await planMessages(client, plan);

    // Then each transaction holds exactly one extend instruction.
    expect(messages.map(message => getExtendLengths(message, account))).toEqual([
        [REALLOC_LIMIT],
        [REALLOC_LIMIT],
        [25_000 - 2 * REALLOC_LIMIT],
    ]);
});

it('resolves a program-derived address account when packing one extend per transaction', async () => {
    // Given an account provided as its full `[address, bump]` PDA tuple rather than a plain
    // address — one of the wider inputs the builder now accepts. The message packer must resolve
    // it to a concrete address to account for the account's growth across transactions; if it did
    // not, the growth comparison would never match and the packing would differ.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const pda = await findCanonicalPda({ program: authority.address, seed: 'idl' });
    const [account] = pda;
    const plan = getExtendInstructionPlan({
        account: pda,
        authority,
        extraLength: 25_000,
        singleExtendPerTransaction: true,
    });

    // When we plan it into transactions.
    const messages = await planMessages(client, plan);

    // Then the packing matches the plain-address case exactly.
    expect(messages.map(message => getExtendLengths(message, account))).toEqual([
        [REALLOC_LIMIT],
        [REALLOC_LIMIT],
        [25_000 - 2 * REALLOC_LIMIT],
    ]);
});

it('resolves an address-carrying account when packing one extend per transaction', async () => {
    // Given an account provided as an arbitrary `HasAddress` carrier (mirroring a third-party
    // wrapper such as web3.js's `PublicKey`), which the builder now accepts and must resolve to a
    // concrete address for the per-transaction growth accounting.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [account] = await findCanonicalPda({ program: authority.address, seed: 'idl' });
    const plan = getExtendInstructionPlan({
        account: { address: account },
        authority,
        extraLength: 25_000,
        singleExtendPerTransaction: true,
    });

    // When we plan it into transactions.
    const messages = await planMessages(client, plan);

    // Then the packing matches the plain-address case exactly.
    expect(messages.map(message => getExtendLengths(message, account))).toEqual([
        [REALLOC_LIMIT],
        [REALLOC_LIMIT],
        [25_000 - 2 * REALLOC_LIMIT],
    ]);
});

it('never grows an account by more than the realloc limit per transaction when creating metadata', async () => {
    // Given a deployed program and a metadata payload larger than two realloc limits.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const data = getUtf8Encoder().encode('x'.repeat(25_000));

    // When we plan its creation with a single extend instruction per transaction.
    const plan = await getCreateMetadataInstructionPlanUsingNewBuffer(client, {
        authority,
        data,
        metadata,
        payer: authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        singleExtendPerTransaction: true,
    });
    const messages = await planMessages(client, plan);

    // Then the first extend shares its transaction with the rent transfer and the
    // allocation, and is shrunk by the account header the allocation creates.
    expect(hasInstructionFrom(messages[0], SYSTEM_PROGRAM_ADDRESS)).toBe(true);
    expect(getInstructionTypes(messages[0], metadata)).toEqual([
        ProgramMetadataInstruction.Allocate,
        ProgramMetadataInstruction.Extend,
    ]);
    expect(getExtendLengths(messages[0], metadata)).toEqual([REALLOC_LIMIT - ACCOUNT_HEADER_LENGTH]);

    // And the remaining extend instructions each get their own transaction, the
    // last one being followed by the write instructions.
    expect(getInstructionTypes(messages[1], metadata)).toEqual([ProgramMetadataInstruction.Extend]);
    expect(getExtendLengths(messages[1], metadata)).toEqual([REALLOC_LIMIT]);
    expect(getInstructionTypes(messages[2], metadata).slice(0, 2)).toEqual([
        ProgramMetadataInstruction.Extend,
        ProgramMetadataInstruction.Write,
    ]);

    // And the account never grows by more than the realloc limit within a transaction
    // whilst the extend instructions add up to the full data length.
    const growths = messages.map(message => getGrowth(message, metadata));
    expect(growths.every(growth => growth <= REALLOC_LIMIT)).toBe(true);
    expect(messages.flatMap(message => getExtendLengths(message, metadata)).reduce((a, b) => a + b, 0)).toBe(
        data.length,
    );
});

it('packs the extend instructions densely when creating metadata by default', async () => {
    // Given a deployed program and a metadata payload larger than two realloc limits.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const data = getUtf8Encoder().encode('x'.repeat(25_000));

    // When we plan its creation without constraining the extend instructions.
    const plan = await getCreateMetadataInstructionPlanUsingNewBuffer(client, {
        authority,
        data,
        metadata,
        payer: authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
    });
    const messages = await planMessages(client, plan);

    // Then all extend instructions share the first transaction with the allocation.
    expect(getInstructionTypes(messages[0], metadata).slice(0, 4)).toEqual([
        ProgramMetadataInstruction.Allocate,
        ProgramMetadataInstruction.Extend,
        ProgramMetadataInstruction.Extend,
        ProgramMetadataInstruction.Extend,
    ]);
    expect(getExtendLengths(messages[0], metadata)).toEqual([REALLOC_LIMIT, REALLOC_LIMIT, 25_000 - 2 * REALLOC_LIMIT]);
});

it('accounts for the header when the data alone fits within the realloc limit', async () => {
    // Given a deployed program and an existing buffer holding exactly one realloc limit of data,
    // which together with the account header exceeds the limit.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const buffer = await generateKeyPairSigner();

    // When we plan the metadata creation from that buffer with a single extend instruction per transaction.
    const plan = await getCreateMetadataInstructionPlanUsingExistingBuffer(client, {
        authority,
        buffer: buffer.address,
        dataLength: REALLOC_LIMIT,
        metadata,
        payer: authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
        singleExtendPerTransaction: true,
    });
    const messages = await planMessages(client, plan);

    // Then the allocation and a header-adjusted extend share the first transaction,
    // and the remaining bytes are extended before the write in the second one.
    expect(getInstructionTypes(messages[0], metadata)).toEqual([
        ProgramMetadataInstruction.Allocate,
        ProgramMetadataInstruction.Extend,
    ]);
    expect(getExtendLengths(messages[0], metadata)).toEqual([REALLOC_LIMIT - ACCOUNT_HEADER_LENGTH]);
    expect(getInstructionTypes(messages[1], metadata)).toEqual([
        ProgramMetadataInstruction.Extend,
        ProgramMetadataInstruction.Write,
        ProgramMetadataInstruction.Initialize,
    ]);
    expect(getExtendLengths(messages[1], metadata)).toEqual([ACCOUNT_HEADER_LENGTH]);
    expect(messages.every(message => getGrowth(message, metadata) <= REALLOC_LIMIT)).toBe(true);
});

it('adds a single extend instruction when the data alone fits within the realloc limit by default', async () => {
    // Given a deployed program and an existing buffer holding exactly one realloc limit of data.
    const client = await createTestClient();
    const authority = await generateKeyPairSignerWithSol(client);
    const [program, programData] = await createDeployedProgram(client, authority);
    const [metadata] = await findCanonicalPda({ program, seed: 'idl' });
    const buffer = await generateKeyPairSigner();

    // When we plan the metadata creation from that buffer without constraining the extend instructions.
    const plan = await getCreateMetadataInstructionPlanUsingExistingBuffer(client, {
        authority,
        buffer: buffer.address,
        dataLength: REALLOC_LIMIT,
        metadata,
        payer: authority,
        program,
        programData,
        seed: 'idl',
        encoding: Encoding.Utf8,
        compression: Compression.None,
        dataSource: DataSource.Direct,
        format: Format.Json,
    });
    const messages = await planMessages(client, plan);

    // Then everything fits in a single transaction with one full extend instruction.
    expect(messages).toHaveLength(1);
    expect(getInstructionTypes(messages[0], metadata)).toEqual([
        ProgramMetadataInstruction.Allocate,
        ProgramMetadataInstruction.Extend,
        ProgramMetadataInstruction.Write,
        ProgramMetadataInstruction.Initialize,
    ]);
    expect(getExtendLengths(messages[0], metadata)).toEqual([REALLOC_LIMIT]);
});

async function planMessages(client: TestClient, plan: InstructionPlan): Promise<TransactionMessage[]> {
    const transactionPlan = await client.planTransactions(plan);
    return flattenTransactionPlan(transactionPlan).map(single => single.message);
}

function getProgramMetadataInstructions(message: TransactionMessage, account: Address) {
    return message.instructions
        .filter(instruction => instruction.programAddress === PROGRAM_METADATA_PROGRAM_ADDRESS && instruction.data)
        .map(instruction => parseProgramMetadataInstruction({ ...instruction, data: instruction.data! }))
        .filter(parsed => Object.values(parsed.accounts)[0]?.address === account);
}

function getInstructionTypes(message: TransactionMessage, account: Address): ProgramMetadataInstruction[] {
    return getProgramMetadataInstructions(message, account).map(parsed => parsed.instructionType);
}

function getExtendLengths(message: TransactionMessage, account: Address): number[] {
    return getProgramMetadataInstructions(message, account).flatMap(parsed =>
        parsed.instructionType === ProgramMetadataInstruction.Extend ? [parsed.data.length] : [],
    );
}

/** Mirrors the runtime's per-transaction accounting of an account's data growth. */
function getGrowth(message: TransactionMessage, account: Address): number {
    return getProgramMetadataInstructions(message, account).reduce((growth, parsed) => {
        switch (parsed.instructionType) {
            case ProgramMetadataInstruction.Allocate:
                return growth + ACCOUNT_HEADER_LENGTH;
            case ProgramMetadataInstruction.Extend:
                return growth + parsed.data.length;
            default:
                return growth;
        }
    }, 0);
}

function hasInstructionFrom(message: TransactionMessage, programAddress: Address): boolean {
    return message.instructions.some(instruction => instruction.programAddress === programAddress);
}
