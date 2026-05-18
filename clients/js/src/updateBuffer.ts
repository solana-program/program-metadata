import { getTransferSolInstruction } from '@solana-program/system';
import {
    Account,
    Address,
    ClientWithGetMinimumBalance,
    lamports,
    parallelInstructionPlan,
    ReadonlyUint8Array,
    sequentialInstructionPlan,
    TransactionSigner,
} from '@solana/kit';

import { Buffer, getCloseInstruction, getTrimInstruction, getWriteInstruction } from './generated';
import { REALLOC_LIMIT } from './internals';
import { getExtendInstructionPlan, getWriteInstructionPlan } from './utils';

export async function getUpdateBufferInstructionPlan(
    client: ClientWithGetMinimumBalance,
    input: {
        buffer: Address;
        authority: TransactionSigner;
        payer: TransactionSigner;
        sizeDifference: number | bigint;
        sourceBuffer?: Account<Buffer>;
        closeSourceBuffer?: Address | boolean;
        data?: ReadonlyUint8Array;
    },
) {
    if (!input.data && !input.sourceBuffer) {
        throw new Error('Either `data` or `sourceBuffer` must be provided to update a buffer.');
    }

    const data = (input.sourceBuffer?.data.data ?? input.data) as ReadonlyUint8Array;
    const extraRent =
        input.sizeDifference > 0
            ? await client.getMinimumBalance(Number(input.sizeDifference), { withoutHeader: true })
            : lamports(0n);

    return sequentialInstructionPlan([
        ...(input.sizeDifference > 0
            ? [
                  getTransferSolInstruction({
                      source: input.payer,
                      destination: input.buffer,
                      amount: extraRent,
                  }),
              ]
            : []),
        ...(input.sizeDifference > REALLOC_LIMIT
            ? [
                  getExtendInstructionPlan({
                      account: input.buffer,
                      authority: input.authority,
                      extraLength: Number(input.sizeDifference),
                  }),
              ]
            : []),
        ...(input.sourceBuffer
            ? [
                  getWriteInstruction({
                      buffer: input.buffer,
                      authority: input.authority,
                      sourceBuffer: input.sourceBuffer.address,
                      offset: 0,
                  }),
              ]
            : [
                  parallelInstructionPlan([
                      getWriteInstructionPlan({
                          buffer: input.buffer,
                          authority: input.authority,
                          data,
                      }),
                  ]),
              ]),
        ...(input.sizeDifference < 0
            ? [
                  getTrimInstruction({
                      account: input.buffer,
                      authority: input.authority,
                      destination: input.payer.address,
                  }),
              ]
            : []),
        ...(input.sourceBuffer && input.closeSourceBuffer
            ? [
                  getCloseInstruction({
                      account: input.sourceBuffer.address,
                      authority: input.authority,
                      destination:
                          typeof input.closeSourceBuffer === 'string' ? input.closeSourceBuffer : input.payer.address,
                  }),
              ]
            : []),
    ]);
}
