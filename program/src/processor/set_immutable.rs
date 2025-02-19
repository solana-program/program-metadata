use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::header::Header;

use super::{validate_authority, validate_metadata};

/// Sets the metadata account as immutable.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [implicit] The `metadata` account is owned by the Program Metadata program. Implicitly checked by writing to the account.
pub fn set_immutable(accounts: &[AccountInfo]) -> ProgramResult {
    let [metadata, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Accounts validation is done in the `validate_authority` function.
    let header = validate_metadata(metadata)?;
    validate_authority(header, authority, program, program_data)?;

    // Make the metadata account immutable.

    let header = unsafe { Header::from_bytes_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

    if header.mutable() {
        header.mutable = 0;
    } else {
        // TODO: use custom error (metadata already immutable)
        return Err(ProgramError::InvalidAccountData);
    }

    Ok(())
}
