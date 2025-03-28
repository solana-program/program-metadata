import { IInstruction } from '@solana/kit';

export type InstructionPlan =
  | SequentialInstructionPlan
  | ParallelInstructionPlan
  | StaticInstructionPlan
  | DynamicInstructionPlan;

export type SequentialInstructionPlan = Readonly<{
  kind: 'sequential';
  plans: InstructionPlan[];
  divisible: boolean;
}>;

export type ParallelInstructionPlan = Readonly<{
  kind: 'parallel';
  plans: InstructionPlan[];
}>;

export type StaticInstructionPlan<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  kind: 'static';
  instruction: TInstruction;
}>;

export type DynamicInstructionPlan<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  kind: 'dynamic';
  instructionFactory: (bytesAvailable: number) => {
    instruction: TInstruction | null;
    hasMore: boolean;
  };
}>;
