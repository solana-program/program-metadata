import {
  appendTransactionMessageInstructions,
  BaseTransactionMessage,
  IInstruction,
} from '@solana/kit';

export type InstructionPlan =
  | SequentialInstructionPlan
  | ParallelInstructionPlan
  | MessageInstructionPlan;

export type SequentialInstructionPlan = Readonly<{
  kind: 'sequential';
  plans: InstructionPlan[];
}>;

export type ParallelInstructionPlan = Readonly<{
  kind: 'parallel';
  plans: InstructionPlan[];
}>;

export type MessageInstructionPlan<
  TInstructions extends IInstruction[] = IInstruction[],
> = Readonly<{
  kind: 'message';
  instructions: TInstructions;
}>;

export function getTransactionMessageFromPlan<
  TTransactionMessage extends BaseTransactionMessage = BaseTransactionMessage,
>(
  defaultMessage: TTransactionMessage,
  plan: MessageInstructionPlan
): TTransactionMessage {
  return appendTransactionMessageInstructions(
    plan.instructions,
    defaultMessage
  );
}
