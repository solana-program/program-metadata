import { getCreateAccountInstruction } from '@solana-program/system';
import {
  Account,
  Lamports,
  ReadonlyUint8Array,
  TransactionSigner,
} from '@solana/kit';
import {
  Buffer,
  getAllocateInstruction,
  getCloseInstruction,
  getSetAuthorityInstruction,
  getWriteInstruction,
  PROGRAM_METADATA_PROGRAM_ADDRESS,
} from './generated';
import {
  parallelInstructionPlan,
  sequentialInstructionPlan,
} from './instructionPlans';
import { getAccountSize, getWriteInstructionPlan } from './utils';

export function getCreateBufferInstructionPlan(input: {
  newBuffer: TransactionSigner;
  authority: TransactionSigner;
  payer: TransactionSigner;
  sourceBuffer?: Account<Buffer>;
  closeSourceBuffer?: boolean;
  data?: ReadonlyUint8Array;
  rent: Lamports;
}) {
  if (!input.data && !input.sourceBuffer) {
    throw new Error(
      'Either `data` or `sourceBuffer` must be provided to create a buffer.'
    );
  }

  const data = (input.data ??
    input.sourceBuffer?.data.data) as ReadonlyUint8Array;

  return sequentialInstructionPlan([
    getCreateAccountInstruction({
      payer: input.payer,
      newAccount: input.newBuffer,
      lamports: input.rent,
      space: getAccountSize(data.length),
      programAddress: PROGRAM_METADATA_PROGRAM_ADDRESS,
    }),
    getAllocateInstruction({
      buffer: input.newBuffer.address,
      authority: input.newBuffer,
    }),
    getSetAuthorityInstruction({
      account: input.newBuffer.address,
      authority: input.newBuffer,
      newAuthority: input.authority.address,
    }),
    ...(input.sourceBuffer
      ? [
          getWriteInstruction({
            buffer: input.newBuffer.address,
            authority: input.authority,
            sourceBuffer: input.sourceBuffer.address,
            offset: 0,
          }),
        ]
      : [
          parallelInstructionPlan([
            getWriteInstructionPlan({
              buffer: input.newBuffer.address,
              authority: input.authority,
              data,
            }),
          ]),
        ]),
    ...(input.closeSourceBuffer && input.sourceBuffer
      ? [
          getCloseInstruction({
            account: input.sourceBuffer.address,
            authority: input.authority,
            destination: input.payer.address,
          }),
        ]
      : []),
  ]);
}
