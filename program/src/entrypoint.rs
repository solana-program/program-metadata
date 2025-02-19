#[cfg(feature = "logging")]
use pinocchio::msg;
use pinocchio::{
    account_info::AccountInfo, default_panic_handler, no_allocator, program_entrypoint,
    program_error::ProgramError, pubkey::Pubkey, ProgramResult,
};

use crate::{
    instruction::ProgramMetadataInstruction,
    processor::{
        allocate::allocate, close::close, extend::extend, initialize::initialize,
        set_authority::set_authority, set_data::set_data, set_immutable::set_immutable,
        withdraw_excess_lamports::withdraw_excess_lamports, write::write,
    },
};

program_entrypoint!(process_instruction);
// Logs panic output.
default_panic_handler!();
// No allocator is used.
no_allocator!();

fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let [instruction, data @ ..] = instruction_data else {
        return Err(ProgramError::InvalidInstructionData);
    };

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
        // 3 - SetData
        ProgramMetadataInstruction::SetData => {
            #[cfg(feature = "logging")]
            msg!("Instruction: SetData");

            set_data(accounts, data)
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
        // 7 - Allocate
        ProgramMetadataInstruction::Allocate => {
            #[cfg(feature = "logging")]
            msg!("Instruction: Allocate");

            allocate(accounts, data)
        }
        // 8 - Extend
        ProgramMetadataInstruction::Extend => {
            #[cfg(feature = "logging")]
            msg!("Instruction: Extend");

            extend(accounts, data)
        }
    }
}
