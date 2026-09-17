import {
    Address,
    appendTransactionMessageInstruction,
    assertAccountExists,
    EncodedAccount,
    fetchEncodedAccount,
    GetAccountInfoApi,
    getAddressDecoder,
    getAddressEncoder,
    getLinearMessagePackerInstructionPlan,
    getMessagePackerInstructionPlanFromInstructions,
    getOptionDecoder,
    getProgramDerivedAddress,
    getStructDecoder,
    getTransactionMessageSize,
    getTransactionMessageSizeLimit,
    getU32Decoder,
    getU64Decoder,
    Instruction,
    MessagePackerInstructionPlan,
    MicroLamports,
    ReadonlyUint8Array,
    Rpc,
    SOLANA_ERROR__INSTRUCTION_PLANS__MAX_INSTRUCTIONS_PER_TRANSACTION_EXCEEDED,
    SOLANA_ERROR__INSTRUCTION_PLANS__MESSAGE_CANNOT_ACCOMMODATE_PLAN,
    SOLANA_ERROR__INSTRUCTION_PLANS__MESSAGE_PACKER_ALREADY_COMPLETE,
    SolanaError,
    TransactionMessage,
    TransactionMessageWithFeePayer,
    TransactionSigner,
    unwrapOption,
} from '@solana/kit';

import {
    CompressionArgs,
    DataSourceArgs,
    EncodingArgs,
    findCanonicalPda,
    findNonCanonicalPda,
    FormatArgs,
    getExtendInstruction,
    getWriteInstruction,
    PROGRAM_METADATA_PROGRAM_ADDRESS,
    parseProgramMetadataInstruction,
    ProgramMetadataInstruction,
    SeedArgs,
} from './generated';

export const ACCOUNT_HEADER_LENGTH = 96;

/**
 * The maximum number of bytes an account can grow by within a single
 * instruction, as enforced by the Solana runtime. When instructions are
 * executed through a CPI, the limit applies to the whole top-level instruction
 * instead.
 */
export const REALLOC_LIMIT = 10_240;

export const LOADER_V3_PROGRAM_ADDRESS =
    'BPFLoaderUpgradeab1e11111111111111111111111' as Address<'BPFLoaderUpgradeab1e11111111111111111111111'>;

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
    /**
     * The metadata PDA address. When omitted, it is derived from `program`,
     * `seed`, and — for non-canonical metadata accounts — `authority`.
     *
     * Provide this explicitly to skip the PDA derivation step.
     */
    metadata?: Address;
    /**
     * The program data account address. When provided, the operation targets a
     * canonical metadata account (managed by the program upgrade authority).
     * When omitted, the operation targets a non-canonical metadata account
     * (managed by a third-party authority).
     */
    programData?: Address;
    /**
     * When `true`, the account is never grown by more than the realloc limit
     * (10,240 bytes) within a single transaction, which implies at most one
     * `extend` instruction per transaction.
     *
     * This is required when the resulting transactions are executed through a
     * CPI — e.g. by a multisig program such as Squads — because the runtime
     * then enforces the realloc limit per transaction rather than per
     * instruction. Defaults to `false`.
     */
    singleExtendPerTransaction?: boolean;
};

export function getAccountSize(dataLength: bigint | number) {
    return BigInt(ACCOUNT_HEADER_LENGTH) + BigInt(dataLength);
}

/**
 * Whether an account created via `allocate` needs explicit `extend`
 * instructions to hold `dataLength` bytes of data.
 *
 * The account grows from nothing to the header length when allocated and to
 * `ACCOUNT_HEADER_LENGTH + dataLength` once written, so the header must be
 * counted towards the realloc limit. Doing so keeps the creation valid when
 * the transactions are executed through a CPI, where the limit applies to the
 * whole transaction rather than to each instruction.
 */
export function needsExtend(dataLength: number): boolean {
    return ACCOUNT_HEADER_LENGTH + dataLength > REALLOC_LIMIT;
}

/**
 * Resolves the metadata PDA address for the given input.
 *
 * - When `input.metadata` is provided, it is used as-is.
 * - When `input.programData` is provided, the canonical PDA is derived from
 *   `program` and `seed`.
 * - Otherwise the non-canonical PDA is derived from `program`, `seed` and
 *   `authority`.
 */
export async function resolveMetadataPda(input: MetadataInput): Promise<Address> {
    if (input.metadata) return input.metadata;
    const [metadata] = input.programData
        ? await findCanonicalPda({ program: input.program, seed: input.seed })
        : await findNonCanonicalPda({
              authority: input.authority.address,
              program: input.program,
              seed: input.seed,
          });
    return metadata;
}

export async function getProgramDataPda(program: Address) {
    return await getProgramDerivedAddress({
        programAddress: LOADER_V3_PROGRAM_ADDRESS,
        seeds: [getAddressEncoder().encode(program)],
    });
}

export async function getProgramAuthority(
    rpc: Rpc<GetAccountInfoApi>,
    program: Address,
): Promise<{ authority?: Address; programData?: Address }> {
    // Fetch the program account.
    const programAccount = await fetchEncodedAccount(rpc, program);
    assertAccountExists(programAccount);

    // Ensure the program is executable.
    if (!programAccount.executable) {
        throw Error('Program account must be executable');
    }

    // Loader v3 programs store their upgrade authority in a separate program
    // data account.
    if (programAccount.programAddress === LOADER_V3_PROGRAM_ADDRESS) {
        return await getProgramAuthorityForLoaderV3(rpc, programAccount);
    }

    // For any other owner (loader v1, v2, v4, the native loader, etc.), the
    // on-chain program considers the program's own address to be its authority
    // — i.e. the program keypair itself must sign to prove canonicity.
    return { authority: program };
}

async function getProgramAuthorityForLoaderV3(rpc: Rpc<GetAccountInfoApi>, programAccount: EncodedAccount) {
    if (programAccount.programAddress !== LOADER_V3_PROGRAM_ADDRESS) {
        throw Error('Invalid loader program, expected loader v3');
    }

    // Fetch the program data account.
    const [programData] = await getProgramDataPda(programAccount.address);
    const programDataAccount = await fetchEncodedAccount(rpc, programData);
    assertAccountExists(programDataAccount);

    // Ensure the program data account is not executable.
    if (programDataAccount.executable) {
        throw Error('The data account associated with the program account must not be executable');
    }

    // Decode the program and program data accounts.
    const [programDecoder, programDataDecoder] = getLoaderV3Decoders();
    const programAccountData = programDecoder.decode(programAccount.data);
    const programDataAccountData = programDataDecoder.decode(programDataAccount.data);

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

/**
 * Builds a message packer plan that grows `account` by `extraLength` bytes
 * using as many `extend` instructions as needed, each bounded by the
 * runtime's realloc limit (10,240 bytes).
 *
 * By default, extend instructions are packed as densely as transaction size
 * allows since the realloc limit applies per instruction when transactions
 * are executed top-level. When `singleExtendPerTransaction` is `true`, the
 * account is never grown by more than the realloc limit within a single
 * transaction — accounting for other growing instructions already present in
 * the transaction, such as `allocate` — so the transactions remain valid when
 * executed through a CPI (e.g. by a multisig program).
 */
export function getExtendInstructionPlan(input: {
    account: Address;
    authority: TransactionSigner;
    extraLength: number;
    program?: Address;
    programData?: Address;
    singleExtendPerTransaction?: boolean;
}): MessagePackerInstructionPlan {
    const getInstruction = (length: number) =>
        getExtendInstruction({
            account: input.account,
            authority: input.authority,
            length,
            program: input.program,
            programData: input.programData,
        });

    if (input.singleExtendPerTransaction) {
        return getSingleExtendMessagePackerInstructionPlan({
            account: input.account,
            getInstruction,
            totalLength: input.extraLength,
        });
    }

    return getMessagePackerInstructionPlanFromInstructions(getReallocChunkSizes(input.extraLength).map(getInstruction));
}

/**
 * Splits `totalLength` into chunks of at most `REALLOC_LIMIT` bytes.
 *
 * Stopgap for Kit's `getReallocMessagePackerInstructionPlan`, which emits a
 * final 0-byte instruction when `totalLength` is an exact multiple of
 * `REALLOC_LIMIT`. Switch back to it once the upstream fix ships.
 *
 * @example
 * ```ts
 * getReallocChunkSizes(25_000); // [10240, 10240, 4520]
 * getReallocChunkSizes(20_480); // [10240, 10240]
 * ```
 */
function getReallocChunkSizes(totalLength: number): number[] {
    const sizes: number[] = [];
    for (let remaining = totalLength; remaining > 0; remaining -= REALLOC_LIMIT) {
        sizes.push(Math.min(REALLOC_LIMIT, remaining));
    }
    return sizes;
}

/**
 * Mirrors the transaction planner's default when no `maxInstructions`
 * configuration is provided to the message packer.
 */
const DEFAULT_MAX_INSTRUCTIONS_PER_TRANSACTION = 16;

/**
 * Creates a message packer that grows `account` by `totalLength` bytes whilst
 * never growing it by more than `REALLOC_LIMIT` bytes within a single
 * transaction message.
 *
 * Each call packs a single `extend` instruction sized to the growth budget the
 * message has left — accounting for program-metadata instructions already
 * present in the message, such as `allocate` — or refuses the message when
 * that budget is spent so the planner opens a new transaction.
 */
function getSingleExtendMessagePackerInstructionPlan(input: {
    account: Address;
    getInstruction: (length: number) => Instruction;
    totalLength: number;
}): MessagePackerInstructionPlan {
    const { account, getInstruction, totalLength } = input;
    return Object.freeze({
        getMessagePacker: () => {
            let remaining = totalLength;
            return Object.freeze({
                done: () => remaining <= 0,
                packMessageToCapacity: (
                    message: TransactionMessage & TransactionMessageWithFeePayer,
                    config?: { maxInstructions?: number },
                ) => {
                    if (remaining <= 0) {
                        throw new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__MESSAGE_PACKER_ALREADY_COMPLETE);
                    }

                    const originalSize = getTransactionMessageSize(message);
                    const growth = getAccountGrowthInMessage(message, account);
                    const budget = growth === 'unknown' ? 0 : Math.min(REALLOC_LIMIT - growth, remaining);
                    if (budget <= 0) {
                        // The message has no growth budget left for this
                        // account. Report the size the next instruction would
                        // need so the planner opens a new message.
                        const wouldBeSize = getTransactionMessageSize(
                            appendTransactionMessageInstruction(
                                getInstruction(Math.min(REALLOC_LIMIT, remaining)),
                                message,
                            ),
                        );
                        throw new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__MESSAGE_CANNOT_ACCOMMODATE_PLAN, {
                            numBytesRequired: wouldBeSize - originalSize,
                            numFreeBytes: getTransactionMessageSizeLimit(message) - originalSize,
                        });
                    }

                    const maxInstructions = config?.maxInstructions ?? DEFAULT_MAX_INSTRUCTIONS_PER_TRANSACTION;
                    if (message.instructions.length >= maxInstructions) {
                        throw new SolanaError(
                            SOLANA_ERROR__INSTRUCTION_PLANS__MAX_INSTRUCTIONS_PER_TRANSACTION_EXCEEDED,
                            {
                                maxInstructions,
                                numInstructions: message.instructions.length + 1,
                            },
                        );
                    }

                    const nextMessage = appendTransactionMessageInstruction(getInstruction(budget), message);
                    const nextSize = getTransactionMessageSize(nextMessage);
                    if (nextSize > getTransactionMessageSizeLimit(nextMessage)) {
                        throw new SolanaError(SOLANA_ERROR__INSTRUCTION_PLANS__MESSAGE_CANNOT_ACCOMMODATE_PLAN, {
                            numBytesRequired: nextSize - originalSize,
                            numFreeBytes: getTransactionMessageSizeLimit(nextMessage) - originalSize,
                        });
                    }

                    remaining -= budget;
                    return nextMessage;
                },
            });
        },
        kind: 'messagePacker',
        planType: 'instructionPlan',
    });
}

/**
 * Estimates by how many bytes `account` is grown by the program-metadata
 * instructions already present in the given transaction message.
 *
 * `allocate` creates the account with the header length and `extend` grows it
 * by its explicit length, so both can be accounted for statically. `write` and
 * `setData` instead resize the account to an absolute target, so their growth
 * depends on the account's size when the transaction lands — on-chain state the
 * message cannot tell us — and `'unknown'` is returned.
 */
function getAccountGrowthInMessage(message: TransactionMessage, account: Address): number | 'unknown' {
    let growth = 0;
    for (const instruction of message.instructions) {
        if (instruction.programAddress !== PROGRAM_METADATA_PROGRAM_ADDRESS || !instruction.data) continue;
        const parsed = parseProgramMetadataInstruction({ ...instruction, data: instruction.data });
        switch (parsed.instructionType) {
            case ProgramMetadataInstruction.Allocate:
                if (parsed.accounts.buffer.address === account) growth += ACCOUNT_HEADER_LENGTH;
                break;
            case ProgramMetadataInstruction.Extend:
                if (parsed.accounts.account.address === account) growth += parsed.data.length;
                break;
            case ProgramMetadataInstruction.Write:
                if (parsed.accounts.buffer.address === account) return 'unknown';
                break;
            case ProgramMetadataInstruction.SetData:
                if (parsed.accounts.metadata.address === account) return 'unknown';
                break;
            default:
                break;
        }
    }
    return growth;
}

export function getWriteInstructionPlan(input: {
    buffer: Address;
    authority: TransactionSigner;
    data: ReadonlyUint8Array;
}): MessagePackerInstructionPlan {
    return getLinearMessagePackerInstructionPlan({
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
