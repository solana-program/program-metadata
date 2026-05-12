use solana_instruction::{AccountMeta, Instruction};
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use spl_program_metadata::instruction::ProgramMetadataInstruction;

use super::PROGRAM_ID;

pub fn set_authority(
    account: &Pubkey,
    authority: &Pubkey,
    program: Option<&Pubkey>,
    program_data: Option<&Pubkey>,
    new_authority: Option<&Pubkey>,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*account, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*program.unwrap_or(&PROGRAM_ID), false),
        AccountMeta::new_readonly(*program_data.unwrap_or(&PROGRAM_ID), false),
    ];

    let mut data = vec![
        ProgramMetadataInstruction::SetAuthority as u8,
        new_authority.is_some() as u8,
    ];
    if let Some(new_authority) = new_authority {
        data.extend_from_slice(new_authority.as_ref());
    }

    Ok(Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    })
}
