use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey, ProgramResult,
};

use crate::state::{header::Header, Zeroable};

use super::validate_authority;

/// Sets the authority of a metadata account.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [implicit] The `metadata` account is owned by the Program Metadata program. Implicitly checked by writing to the account.
pub fn set_authority(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    let [metadata, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    let (has_new_authority, new_authority) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    // Accounts validation is done in the `validate_update` function.
    //  - metadata: program owned is implicitly checked since we are writing to
    //    the account
    validate_authority(metadata, authority, program, program_data)?;

    let header = unsafe { Header::load_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

    if !header.canonical() {
        // TODO: use custom error (non canonical account)
        return Err(ProgramError::InvalidAccountData);
    }

    // Set the new authority.

    header.authority = if *has_new_authority == 0 {
        Pubkey::ZERO.into()
    } else {
        let new_authority: Pubkey = new_authority
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?;
        new_authority.into()
    };

    Ok(())
}
