#[cfg(feature = "logging")]
use pinocchio::msg;
use pinocchio::{
    account_info::AccountInfo, entrypoint, program_error::ProgramError, pubkey::Pubkey,
    ProgramResult,
};

use crate::{
    instruction::ProgramMetadataInstruction,
    processor::{
        close::close, initialize::initialize, set_authority::set_authority,
        set_immutable::set_immutable, withdraw_excess_lamports::withdraw_excess_lamports,
        write::write,
    },
};

entrypoint!(process_instruction);

fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let (instruction, data) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    match ProgramMetadataInstruction::try_from(instruction)? {
        // 0 - Write
        ProgramMetadataInstruction::Write => {
            #[cfg(feature = "logging")]
            msg!("Instruction: Write");

            write(accounts, data)
        }
        // 1 - Initialize
        ProgramMetadataInstruction::Initialize => {
            #[cfg(feature = "logging")]
            msg!("Instruction: Initialize");

            initialize(accounts, data)
        }
        // 2 - SetAuthority
        ProgramMetadataInstruction::SetAuthority => {
            #[cfg(feature = "logging")]
            msg!("Instruction: SetAuthority");

            set_authority(accounts, data)
        }
        // 4 - SetImmutable
        ProgramMetadataInstruction::SetImmutable => {
            #[cfg(feature = "logging")]
            msg!("Instruction: SetImmutable");

            set_immutable(accounts)
        }
        // 5 - WithdrawExcessLamports
        ProgramMetadataInstruction::WithdrawExcessLamports => {
            #[cfg(feature = "logging")]
            msg!("Instruction: WithdrawExcessLamports");

            withdraw_excess_lamports(accounts)
        }
        // 6 - Close
        ProgramMetadataInstruction::Close => {
            #[cfg(feature = "logging")]
            msg!("Instruction: Close");

            close(accounts)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
