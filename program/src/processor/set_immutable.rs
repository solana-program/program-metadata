use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::header::Header;

use super::validate_update;

/// Sets the metadata account as immutable.
pub fn set_immutable(accounts: &[AccountInfo]) -> ProgramResult {
    let [metadata, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Accounts validation is done in the `validate_update` function.
    //  - metadata: program owned is implicitly checked since we are writing to
    //    the account
    validate_update(metadata, authority, program, program_data)?;

    // Make the metadata account immutable.

    let header = unsafe { Header::load_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

    if header.mutable() {
        header.mutable = 0;
    } else {
        // TODO: use custom error (metadata already immutable)
        return Err(ProgramError::InvalidAccountData);
    }

    Ok(())
}
