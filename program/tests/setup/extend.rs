use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
};
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn extend(
    account: &Pubkey,
    authority: &Pubkey,
    program: Option<&Pubkey>,
    program_data: Option<&Pubkey>,
    length: u16,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*account, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*program.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program_data.unwrap_or(&PROGRAM_ID), false),
    ];

    let mut data = vec![ProgramMetadataInstruction::Extend as u8];
    data.extend_from_slice(&length.to_le_bytes());

    Ok(Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    })
}
