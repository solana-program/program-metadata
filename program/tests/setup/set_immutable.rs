use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn set_immutable(
    metadata: &Pubkey,
    authority: &Pubkey,
    program: Option<&Pubkey>,
    program_data: Option<&Pubkey>,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new(*metadata, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*program.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program_data.unwrap_or(&PROGRAM_ID), false),
    ];

    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data: vec![ProgramMetadataInstruction::SetImmutable as u8],
    }
}
