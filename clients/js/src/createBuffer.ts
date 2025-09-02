import { getCreateAccountInstruction } from '@solana-program/system';
import {
  Account,
  Address,
  Lamports,
  parallelInstructionPlan,
  ReadonlyUint8Array,
  sequentialInstructionPlan,
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
import { getAccountSize, getWriteInstructionPlan } from './utils';

export function getCreateBufferInstructionPlan(input: {
  newBuffer: TransactionSigner;
  authority: TransactionSigner;
  payer: TransactionSigner;
  sourceBuffer?: Account<Buffer>;
  closeSourceBuffer?: Address | boolean;
  data?: ReadonlyUint8Array;
  rent: Lamports;
}) {
  if (!input.data && !input.sourceBuffer) {
    throw new Error(
      'Either `data` or `sourceBuffer` must be provided to create a buffer.'
    );
  }

  const data = (input.sourceBuffer?.data.data ??
    input.data) as ReadonlyUint8Array;

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
    ...(input.sourceBuffer && input.closeSourceBuffer
      ? [
          getCloseInstruction({
            account: input.sourceBuffer.address,
            authority: input.authority,
            destination:
              typeof input.closeSourceBuffer === 'string'
                ? input.closeSourceBuffer
                : input.payer.address,
          }),
        ]
      : []),
  ]);
}
