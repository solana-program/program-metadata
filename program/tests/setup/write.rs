use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
};
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn write(
    buffer: &Pubkey,
    authority: &Pubkey,
    offset: u32,
    data: &[u8],
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*buffer, false),
        AccountMeta::new_readonly(*authority, true),
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
