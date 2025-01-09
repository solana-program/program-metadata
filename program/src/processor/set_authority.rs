use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey, ProgramResult,
};

use crate::state::{header::Header, Zeroable};

use super::validate_update;

/// Sets the authority of a metadata account.
pub fn set_authority(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    let [metadata, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    let (has_new_authority, new_authority) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    validate_update(metadata, authority, program, program_data)?;

    // Set the new authority.

    let header = unsafe { Header::load_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

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
