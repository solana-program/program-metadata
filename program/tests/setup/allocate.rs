use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
};
use spl_program_metadata::{instruction::ProgramMetadataInstruction, state::SEED_LEN};

use super::PROGRAM_ID;

pub fn allocate(
    buffer: &Pubkey,
    authority: &Pubkey,
    program: Option<&Pubkey>,
    program_data: Option<&Pubkey>,
    seed: Option<&[u8; SEED_LEN]>,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*buffer, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*program.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program_data.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let mut data = vec![ProgramMetadataInstruction::Allocate as u8];
    if let Some(seed) = seed {
        data.extend_from_slice(seed);
    }

    Ok(Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    })
}
