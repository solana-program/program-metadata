use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

pub mod initialize;
pub mod set_authority;
pub mod write;

#[inline(always)]
fn is_program_authority(
    program: &AccountInfo,
    program_data: &AccountInfo,
    authority: &Pubkey,
) -> Result<bool, ProgramError> {
    // program
    // - must be executable

    let program_account_data = unsafe { program.borrow_data_unchecked() };

    let program_data_key = match (program_account_data.first(), program.executable()) {
        // 2 - program
        (Some(2), true) => {
            // offset = 4 (discriminator)
            let program_data_key: Pubkey = program_account_data[4..]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?;
            program_data_key
        }
        _ => {
            // TODO: use custom error (invalid program state)
            return Err(ProgramError::InvalidAccountData);
        }
    };

    // program data
    // - must match the program account data

    if program_data_key != *program_data.key() {
        // TODO: use custom error (invalid program data account)
        return Err(ProgramError::InvalidAccountData);
    }

    let program_data_account_data = unsafe { program_data.borrow_data_unchecked() };

    match (program_data_account_data.first(), program_data.executable()) {
        // 3 - program data
        (Some(3), false) => {
            // offset = 4 (discriminator) + 8 (slot) + 1 (option)
            let authority_key: Pubkey = program_data_account_data[13..]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?;
            Ok(authority == &authority_key)
        }
        _ => {
            // TODO: use custom error (invalid program state)
            Err(ProgramError::InvalidAccountData)
        }
    }
}
