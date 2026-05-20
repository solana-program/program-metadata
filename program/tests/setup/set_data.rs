use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn set_data(
    metadata: &Pubkey,
    authority: &Pubkey,
    buffer: Option<&Pubkey>,
    program: Option<&Pubkey>,
    program_data: Option<&Pubkey>,
    args: SetDataArgs,
    instruction_data: Option<&[u8]>,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new(*metadata, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*buffer.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program_data.unwrap_or(&PROGRAM_ID), false),
    ];

    let mut data = vec![
        ProgramMetadataInstruction::SetData as u8,
        args.encoding,
        args.compression,
        args.format,
    ];

    if let Some(data_source) = args.data_source {
        data.push(data_source);
        if let Some(instruction_data) = instruction_data {
            data.extend_from_slice(instruction_data);
        }
    }

    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    }
}

pub struct SetDataArgs {
    pub encoding: u8,
    pub compression: u8,
    pub format: u8,
    pub data_source: Option<u8>,
}
