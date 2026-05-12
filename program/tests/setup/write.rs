use solana_instruction::{AccountMeta, Instruction};
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn write(
    buffer: &Pubkey,
    authority: &Pubkey,
    source_buffer: Option<&Pubkey>,
    offset: u32,
    data: &[u8],
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*buffer, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*source_buffer.unwrap_or(&PROGRAM_ID), false),
    ];

    let mut instruction_data = vec![ProgramMetadataInstruction::Write as u8];
    instruction_data.extend_from_slice(&offset.to_le_bytes());
    instruction_data.extend_from_slice(data);

    Ok(Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data: instruction_data,
    })
}
