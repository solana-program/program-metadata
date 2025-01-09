#[cfg(feature = "logging")]
use pinocchio::msg;
use pinocchio::{
    account_info::AccountInfo, entrypoint, program_error::ProgramError, pubkey::Pubkey,
    ProgramResult,
};

use crate::{instruction::ProgramMetadataInstruction, processor::write::write};

entrypoint!(process_instruction);

fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let (instruction, _data) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match ProgramMetadataInstruction::try_from(instruction)? {
        // 0 - Write
        ProgramMetadataInstruction::Write => {
            #[cfg(feature = "logging")]
            msg!("Instruction: Write");

            write(accounts)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
