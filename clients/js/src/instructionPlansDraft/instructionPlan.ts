import { IInstruction } from '@solana/kit';

export type InstructionPlan =
  | SequentialInstructionPlan
  | ParallelInstructionPlan
  | SingleInstructionPlan
  | IterableInstructionPlan;

export type SequentialInstructionPlan = Readonly<{
  kind: 'sequential';
  plans: InstructionPlan[];
  divisible: boolean;
}>;

export type ParallelInstructionPlan = Readonly<{
  kind: 'parallel';
  plans: InstructionPlan[];
}>;

export type SingleInstructionPlan<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  kind: 'single';
  instruction: TInstruction;
}>;

export type IterableInstructionPlan<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  kind: 'iterable';
  getIterator: () => InstructionIterator<TInstruction>;
}>;

export type InstructionIterator<
  TInstruction extends IInstruction = IInstruction,
> = Readonly<{
  /** Checks whether there are more instructions to retrieve. */
  hasNext: () => boolean;
  /** Get the next instruction. */
  next: (bytes: number) => TInstruction;
  /** Get the next instruction without advancing the iterator. */
  peek: (bytes: number) => TInstruction;
  /** Tries to get all remaining instructions or return `null` if not possible */
  peekAll: () => TInstruction[] | null;
}>;
