import {
    ClientWithGetMinimumBalance,
    ClientWithPayer,
    ClientWithTransactionPlanning,
    ClientWithTransactionSending,
    extendClient,
    pipe,
    TransactionPlanResult,
} from '@solana/kit';
import { addSelfPlanAndSendFunctions, SelfPlanAndSendFunctions } from '@solana/kit/program-client-core';

import {
    getCreateBufferInstructionPlan,
    getCreateCanonicalBufferInstructionPlan,
    getCreateNonCanonicalBufferInstructionPlan,
} from './createBuffer';
import {
    createMetadata,
    getCreateMetadataInstructionPlanUsingExistingBuffer,
    getCreateMetadataInstructionPlanUsingInstructionData,
    getCreateMetadataInstructionPlanUsingNewBuffer,
} from './createMetadata';
import {
    programMetadataProgram as generatedProgramMetadataProgram,
    ProgramMetadataPlugin as GeneratedProgramMetadataPlugin,
    ProgramMetadataPluginInstructions as GeneratedProgramMetadataPluginInstructions,
    ProgramMetadataPluginRequirements as GeneratedProgramMetadataPluginRequirements,
} from './generated';
import { getUpdateBufferInstructionPlan } from './updateBuffer';
import {
    getUpdateMetadataInstructionPlanUsingExistingBuffer,
    getUpdateMetadataInstructionPlanUsingInstructionData,
    getUpdateMetadataInstructionPlanUsingNewBuffer,
    updateMetadata,
} from './updateMetadata';
import { MetadataInput } from './utils';
import { writeMetadata } from './writeMetadata';

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type PluginInstructionInput<TFn extends (client: never, input: never) => unknown> = MakeOptional<
    Parameters<TFn>[1],
    'payer'
>;

type PluginInstructionReturn<TFn extends (client: never, input: never) => unknown> = ReturnType<TFn> &
    SelfPlanAndSendFunctions;

export type ProgramMetadataPluginRequirements = GeneratedProgramMetadataPluginRequirements &
    ClientWithGetMinimumBalance &
    ClientWithPayer &
    ClientWithTransactionPlanning &
    ClientWithTransactionSending;

export type ProgramMetadataPlugin = Omit<GeneratedProgramMetadataPlugin, 'instructions'> & {
    instructions: ProgramMetadataPluginInstructions;
    createMetadata: (input: MakeOptional<MetadataInput, 'payer'>) => Promise<TransactionPlanResult>;
    updateMetadata: (input: MakeOptional<MetadataInput, 'payer'>) => Promise<TransactionPlanResult>;
    writeMetadata: (input: MakeOptional<MetadataInput, 'payer'>) => Promise<TransactionPlanResult>;
};

export type ProgramMetadataPluginInstructions = Omit<GeneratedProgramMetadataPluginInstructions, 'batch'> & {
    createBuffer: (
        input: PluginInstructionInput<typeof getCreateBufferInstructionPlan>,
    ) => PluginInstructionReturn<typeof getCreateBufferInstructionPlan>;
    createCanonicalBuffer: (
        input: PluginInstructionInput<typeof getCreateCanonicalBufferInstructionPlan>,
    ) => PluginInstructionReturn<typeof getCreateCanonicalBufferInstructionPlan>;
    createNonCanonicalBuffer: (
        input: PluginInstructionInput<typeof getCreateNonCanonicalBufferInstructionPlan>,
    ) => PluginInstructionReturn<typeof getCreateNonCanonicalBufferInstructionPlan>;
    updateBuffer: (
        input: PluginInstructionInput<typeof getUpdateBufferInstructionPlan>,
    ) => PluginInstructionReturn<typeof getUpdateBufferInstructionPlan>;
    createMetadataUsingInstructionData: (
        input: PluginInstructionInput<typeof getCreateMetadataInstructionPlanUsingInstructionData>,
    ) => PluginInstructionReturn<typeof getCreateMetadataInstructionPlanUsingInstructionData>;
    createMetadataUsingNewBuffer: (
        input: PluginInstructionInput<typeof getCreateMetadataInstructionPlanUsingNewBuffer>,
    ) => PluginInstructionReturn<typeof getCreateMetadataInstructionPlanUsingNewBuffer>;
    createMetadataUsingExistingBuffer: (
        input: PluginInstructionInput<typeof getCreateMetadataInstructionPlanUsingExistingBuffer>,
    ) => PluginInstructionReturn<typeof getCreateMetadataInstructionPlanUsingExistingBuffer>;
    updateMetadataUsingInstructionData: (
        input: PluginInstructionInput<typeof getUpdateMetadataInstructionPlanUsingInstructionData>,
    ) => PluginInstructionReturn<typeof getUpdateMetadataInstructionPlanUsingInstructionData>;
    updateMetadataUsingNewBuffer: (
        input: PluginInstructionInput<typeof getUpdateMetadataInstructionPlanUsingNewBuffer>,
    ) => PluginInstructionReturn<typeof getUpdateMetadataInstructionPlanUsingNewBuffer>;
    updateMetadataUsingExistingBuffer: (
        input: PluginInstructionInput<typeof getUpdateMetadataInstructionPlanUsingExistingBuffer>,
    ) => PluginInstructionReturn<typeof getUpdateMetadataInstructionPlanUsingExistingBuffer>;
};

export function programMetadataProgram() {
    return <T extends ProgramMetadataPluginRequirements>(client: T) => {
        return pipe(client, generatedProgramMetadataProgram(), c => {
            const withPayer = <TInput extends { payer?: ProgramMetadataPluginRequirements['payer'] }>(input: TInput) =>
                ({ ...input, payer: input.payer ?? client.payer }) as TInput & {
                    payer: ProgramMetadataPluginRequirements['payer'];
                };
            return extendClient(c, {
                programMetadata: {
                    ...c.programMetadata,
                    instructions: {
                        ...c.programMetadata.instructions,
                        createBuffer: input =>
                            addSelfPlanAndSendFunctions(c, getCreateBufferInstructionPlan(c, withPayer(input))),
                        createCanonicalBuffer: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getCreateCanonicalBufferInstructionPlan(c, withPayer(input)),
                            ),
                        createNonCanonicalBuffer: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getCreateNonCanonicalBufferInstructionPlan(c, withPayer(input)),
                            ),
                        updateBuffer: input =>
                            addSelfPlanAndSendFunctions(c, getUpdateBufferInstructionPlan(c, withPayer(input))),
                        createMetadataUsingInstructionData: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getCreateMetadataInstructionPlanUsingInstructionData(c, withPayer(input)),
                            ),
                        createMetadataUsingNewBuffer: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getCreateMetadataInstructionPlanUsingNewBuffer(c, withPayer(input)),
                            ),
                        createMetadataUsingExistingBuffer: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getCreateMetadataInstructionPlanUsingExistingBuffer(c, withPayer(input)),
                            ),
                        updateMetadataUsingInstructionData: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getUpdateMetadataInstructionPlanUsingInstructionData(c, withPayer(input)),
                            ),
                        updateMetadataUsingNewBuffer: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getUpdateMetadataInstructionPlanUsingNewBuffer(c, withPayer(input)),
                            ),
                        updateMetadataUsingExistingBuffer: input =>
                            addSelfPlanAndSendFunctions(
                                c,
                                getUpdateMetadataInstructionPlanUsingExistingBuffer(c, withPayer(input)),
                            ),
                    },
                    createMetadata: input => createMetadata(c, withPayer(input)),
                    updateMetadata: input => updateMetadata(c, withPayer(input)),
                    writeMetadata: input => writeMetadata(c, withPayer(input)),
                } satisfies ProgramMetadataPlugin,
            });
        });
    };
}
