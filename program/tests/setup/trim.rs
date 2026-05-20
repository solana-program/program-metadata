use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;
use solana_sdk_ids::sysvar::rent;
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn trim(
    account: &Pubkey,
    authority: &Pubkey,
    program: Option<&Pubkey>,
    program_data: Option<&Pubkey>,
    destination: &Pubkey,
) -> Instruction {
    let accounts = vec![
        AccountMeta::new(*account, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*program.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program_data.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new(*destination, false),
        AccountMeta::new_readonly(rent::ID, false),
    ];

    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data: vec![ProgramMetadataInstruction::Trim as u8],
    }
}
