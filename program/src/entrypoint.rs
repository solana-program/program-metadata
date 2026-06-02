use pinocchio::{
    default_panic_handler, error::ProgramError, no_allocator, program_entrypoint, AccountView,
    Address, ProgramResult,
};

use crate::{
    instruction::ProgramMetadataInstruction,
    processor::{
        allocate::allocate, close::close, extend::extend, initialize::initialize,
        set_authority::set_authority, set_data::set_data, set_immutable::set_immutable, trim::trim,
        write::write,
    },
};

program_entrypoint!(process_instruction);
// Logs panic output.
default_panic_handler!();
// No allocator is used.
no_allocator!();

/// Logs a message if the "logging" feature is enabled.
macro_rules! cfg_log {
    ($msg:literal) => {
        #[cfg(feature = "logging")]
        solana_program_log::log($msg);
    };
}

fn process_instruction(
    _program_id: &Address,
    accounts: &mut [AccountView],
    instruction_data: &[u8],
) -> ProgramResult {
    let [instruction, data @ ..] = instruction_data else {
        return Err(ProgramError::InvalidInstructionData);
    };

    match ProgramMetadataInstruction::try_from(*instruction)? {
        // 0 - Write
        ProgramMetadataInstruction::Write => {
            cfg_log!("Instruction: Write");
            write(accounts, data)
        }
        // 1 - Initialize
        ProgramMetadataInstruction::Initialize => {
            cfg_log!("Instruction: Initialize");
            initialize(accounts, data)
        }
        // 2 - SetAuthority
        ProgramMetadataInstruction::SetAuthority => {
            cfg_log!("Instruction: SetAuthority");
            set_authority(accounts, data)
        }
        // 3 - SetData
        ProgramMetadataInstruction::SetData => {
            cfg_log!("Instruction: SetData");
            set_data(accounts, data)
        }
        // 4 - SetImmutable
        ProgramMetadataInstruction::SetImmutable => {
            cfg_log!("Instruction: SetImmutable");
            set_immutable(accounts)
        }
        // 5 - Trim
        ProgramMetadataInstruction::Trim => {
            cfg_log!("Instruction: Trim");
            trim(accounts)
        }
        // 6 - Close
        ProgramMetadataInstruction::Close => {
            cfg_log!("Instruction: Close");
            close(accounts)
        }
        // 7 - Allocate
        ProgramMetadataInstruction::Allocate => {
            cfg_log!("Instruction: Allocate");
            allocate(accounts, data)
        }
        // 8 - Extend
        ProgramMetadataInstruction::Extend => {
            cfg_log!("Instruction: Extend");
            extend(accounts, data)
        }
    }
}
