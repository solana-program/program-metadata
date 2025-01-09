use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey, ProgramResult,
};

use crate::state::{header::Header, Zeroable};

use super::is_program_authority;

/// Sets the authority of a metadata account.
pub fn set_authority(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    let [metadata, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    let (has_new_authority, new_authority) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;

    // Account validation.

    // metadata
    // - must be mutable
    // - implicit program owned check since we are writing to the account

    let header = unsafe { Header::load_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

    if !header.mutable() {
        // TODO: use custom error (immutable metadata account)
        return Err(ProgramError::InvalidAccountData);
    }

    // authority
    // - must be a signer
    // - must match the current authority or be the program upgrade authority

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let authorized = if let Some(metadata_authority) = header.authority.as_ref() {
        metadata_authority == authority.key()
    } else {
        false
    };

    // Either the authority is the current authority or it is a canonical metadata
    // account and the authority provided is the program upgrade authority; otherwise,
    // the authority is invalid.
    if !(authorized
        || (header.canonical()
            && program.key() == &header.program
            && is_program_authority(program, program_data, authority.key())?))
    {
        return Err(ProgramError::IncorrectAuthority);
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
