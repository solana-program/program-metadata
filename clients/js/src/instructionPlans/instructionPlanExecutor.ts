import {
  InstructionPlan,
  MessageInstructionPlan,
  ParallelInstructionPlan,
} from './instructionPlan';

export type InstructionPlanExecutor = (
  plan: InstructionPlan,
  config?: { abortSignal?: AbortSignal }
) => Promise<void>;

export function createInstructionPlanExecutor(
  handleMessage: (
    plan: MessageInstructionPlan,
    config?: { abortSignal?: AbortSignal }
  ) => Promise<void>
): InstructionPlanExecutor {
  return async function self(plan, config) {
    switch (plan.kind) {
      case 'sequential':
        for (const subPlan of plan.plans) {
          await self(subPlan, config);
        }
        break;
      case 'parallel':
        await Promise.all(plan.plans.map((subPlan) => self(subPlan, config)));
        break;
      case 'message':
        return await handleMessage(plan, config);
      default:
        throw new Error('Unsupported instruction plan');
    }
  };
}

export function chunkParallelInstructionPlans(
  executor: InstructionPlanExecutor,
  chunkSize: number
): InstructionPlanExecutor {
  const chunkPlan = (
    plan: ParallelInstructionPlan
  ): ParallelInstructionPlan[] => {
    return plan.plans
      .reduce(
        (chunks, subPlan) => {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk && lastChunk.length < chunkSize) {
            lastChunk.push(subPlan);
          } else {
            chunks.push([subPlan]);
          }
          return chunks;
        },
        [[]] as InstructionPlan[][]
      )
      .map((plans) => ({ kind: 'parallel', plans }) as ParallelInstructionPlan);
  };
  return async function self(plan, config) {
    switch (plan.kind) {
      case 'sequential':
        return await self(plan, config);
      case 'parallel':
        for (const chunk of chunkPlan(plan)) {
          await executor(chunk, config);
        }
        break;
      default:
        return await executor(plan, config);
    }
  };
}
