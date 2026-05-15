import {
    estimateAndUpdateProvisoryComputeUnitLimitFactory,
    estimateComputeUnitLimitFactory,
    fillProvisorySetComputeUnitLimitInstruction,
    setTransactionMessageComputeUnitPrice,
} from '@solana-program/compute-budget';
import {
    Address,
    assertIsSendableTransaction,
    assertIsTransactionWithBlockhashLifetime,
    ClientWithTransactionPlanning,
    createTransactionMessage,
    createTransactionPlanExecutor,
    createTransactionPlanner,
    GetAccountInfoApi,
    GetLatestBlockhashApi,
    InstructionPlan,
    MicroLamports,
    pipe,
    Rpc,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    SimulateTransactionApi,
    TransactionPlanExecutorConfig,
    TransactionSigner,
} from '@solana/kit';
import { findMetadataPda, SeedArgs } from './generated';
import { getProgramAuthority } from './utils';

export const REALLOC_LIMIT = 10_240;

export type PdaDetails = {
    metadata: Address;
    isCanonical: boolean;
    programData?: Address;
};

/**
 * Fetches the on-chain state of `program` to determine whether the metadata
 * account is canonical (i.e. the caller's authority matches the program's
 * upgrade authority) and returns the resolved metadata PDA along with the
 * associated program-data account when applicable.
 */
export async function getPdaDetails(input: {
    rpc: Rpc<GetAccountInfoApi>;
    program: Address;
    authority: TransactionSigner | Address;
    seed: SeedArgs;
}): Promise<PdaDetails> {
    const authorityAddress = typeof input.authority === 'string' ? input.authority : input.authority.address;
    const { authority, programData } = await getProgramAuthority(input.rpc, input.program);
    const isCanonical = !!authority && authority === authorityAddress;
    const [metadata] = await findMetadataPda({
        program: input.program,
        authority: isCanonical ? null : authorityAddress,
        seed: input.seed,
    });
    return { metadata, isCanonical, programData };
}

export function createDefaultTransactionPlannerAndExecutor(input: {
    concurrency?: number;
    payer: TransactionSigner;
    priorityFees?: MicroLamports;
    rpc: Parameters<typeof sendAndConfirmTransactionFactory>[0]['rpc'] &
        Rpc<GetLatestBlockhashApi & SimulateTransactionApi>;
    rpcSubscriptions: Parameters<typeof sendAndConfirmTransactionFactory>[0]['rpcSubscriptions'];
}) {
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory(input);
    const estimateCULimit = estimateComputeUnitLimitFactory(input);
    const estimateAndSetCULimit = estimateAndUpdateProvisoryComputeUnitLimitFactory(estimateCULimit);

    const planner = createTransactionPlanner({
        createTransactionMessage: () =>
            pipe(
                createTransactionMessage({ version: 0 }),
                m => setTransactionMessageFeePayerSigner(input.payer, m),
                m => fillProvisorySetComputeUnitLimitInstruction(m),
                m => (input.priorityFees ? setTransactionMessageComputeUnitPrice(input.priorityFees, m) : m),
            ),
    });

    const executor = createTransactionPlanExecutor({
        executeTransactionMessage: limitFunction(async (context, message, config) => {
            const { value: latestBlockhash } = await input.rpc.getLatestBlockhash().send();
            const transaction = await pipe(
                setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
                m => (context.message = m),
                async m => await estimateAndSetCULimit(m, config),
                async m => (context.message = await m),
                async m => await signTransactionMessageWithSigners(await m, config),
            );
            context.transaction = transaction;
            assertIsSendableTransaction(transaction);
            assertIsTransactionWithBlockhashLifetime(transaction);
            await sendAndConfirmTransaction(transaction, {
                ...config,
                commitment: 'confirmed',
            });
            return transaction;
        }, input.concurrency ?? 5),
    } as TransactionPlanExecutorConfig);

    return { planner, executor };
}

/**
 * Returns `true` if the given instruction plan can be planned by the client's
 * transaction planner without throwing — i.e. it fits within a single
 * transaction subject to the planner's compute and size limits.
 */
export async function isValidInstructionPlan(instructionPlan: InstructionPlan, client: ClientWithTransactionPlanning) {
    try {
        await client.planTransaction(instructionPlan);
        return true;
    } catch {
        return false;
    }
}

function limitFunction<TArguments extends unknown[], TReturnType>(
    fn: (...args: TArguments) => PromiseLike<TReturnType>,
    concurrency: number,
): (...args: TArguments) => Promise<TReturnType> {
    let running = 0;
    const queue: Array<{
        args: TArguments;
        resolve: (value: TReturnType) => void;
        reject: (reason?: unknown) => void;
    }> = [];

    function process() {
        // Do nothing if we're still running at max concurrency
        // or if there's nothing left to process.
        if (running >= concurrency || queue.length === 0) return;

        running++;
        const { args, resolve, reject } = queue.shift()!;

        Promise.resolve(fn(...args))
            .then(resolve)
            .catch(reject)
            .finally(() => {
                running--;
                process();
            });
    }

    return function (...args) {
        return new Promise((resolve, reject) => {
            queue.push({ args, resolve, reject });
            process();
        });
    };
}
