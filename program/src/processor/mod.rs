use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::state::{header::Header, AccountDiscriminator};

pub mod close;
pub mod initialize;
pub mod set_authority;
pub mod set_immutable;
pub mod withdraw_excess_lamports;
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

#[inline(always)]
fn validate_update(
    metadata: &AccountInfo,
    authority: &AccountInfo,
    program: &AccountInfo,
    program_data: &AccountInfo,
) -> Result<(), ProgramError> {
    // metadata
    // - must be mutable
    // - implicit program owned check since we are writing to the account

    let header = unsafe { Header::load_unchecked(metadata.borrow_data_unchecked()) };

    if header.discriminator != AccountDiscriminator::Metadata as u8 {
        return Err(ProgramError::UninitializedAccount);
    }

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

    Ok(())
}
