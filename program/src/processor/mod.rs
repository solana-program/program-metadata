use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::state::{header::Header, AccountDiscriminator};

pub mod allocate;
pub mod close;
pub mod initialize;
pub mod set_authority;
pub mod set_immutable;
pub mod withdraw_excess_lamports;
pub mod write;

/// Checks if the provided `authority` is the authority allowed to update the `program`.
/// Fails when providing unexpected input.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [explicit] The `program` account must be executable.
/// - [explicit] The `program` account discriminator (first byte) must be `2` — i.e. defining a `Program` account.
/// - [explicit] The `program_data` account is optional. When set to `crate::ID`, the function returns `false`.
/// - [explicit] When provided, the `program_data` account must be the one set on the `program` account data.
/// - [explicit] When provided, the `program_data` account must not be executable.
/// - [explicit] When provided, the `program_data` account discriminator (first byte) must be `3` — i.e. defining a `ProgramData` account.
/// - [explicit] When provided, the `program_data` account must have 32 bytes of data in the range [13..45], representing the authority.
#[inline(always)]
fn is_program_authority(
    program: &AccountInfo,
    program_data: &AccountInfo,
    authority: &Pubkey,
) -> Result<bool, ProgramError> {
    // If we don't have a program data to check against, we can't verify
    // the program upgrade authority.
    if program_data.key() == &crate::ID {
        return Ok(false);
    }

    // Program checks.
    let expected_program_data = {
        let data = unsafe { program.borrow_data_unchecked() };
        match (data.first(), program.executable()) {
            (Some(2 /* program discriminator */), true) => {
                let offset: usize = 4 /* discriminator */;
                Pubkey::try_from(&data[offset..]).map_err(|_| ProgramError::InvalidAccountData)?
            }
            _ => {
                // TODO: use custom error (invalid program state)
                return Err(ProgramError::InvalidAccountData);
            }
        }
    };

    // Program <-> Program Data check.
    if expected_program_data != *program_data.key() {
        // TODO: use custom error (invalid program data account)
        return Err(ProgramError::InvalidAccountData);
    }

    // Program Data checks.
    let is_program_authority = {
        let data = unsafe { program_data.borrow_data_unchecked() };
        match (data.first(), program_data.executable()) {
            (Some(3 /* program data discriminator */), false) => {
                let option_offset: usize = 4 /* discriminator */ + 8 /* slot */;
                if data[option_offset] == 1 {
                    let pubkey_offset: usize = option_offset + 1 /* option */;
                    let authority_key = Pubkey::try_from(&data[pubkey_offset..])
                        .map_err(|_| ProgramError::InvalidAccountData)?;
                    authority == &authority_key
                } else {
                    false
                }
            }
            _ => {
                // TODO: use custom error (invalid program state)
                return Err(ProgramError::InvalidAccountData);
            }
        }
    };

    Ok(is_program_authority)
}

/// Ensures the `metadata` account can be updated by the provided `authority`.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [explicit] The `metadata` account discriminator (first byte) must be `2` — i.e. defining a `Metadata` account.
/// - [explicit] The `metadata` account must be mutable — i.e. `mutable = true`.
/// - [explicit] The `authority` account must be a signer.
/// - [explicit] The `authority` account must match the authority set on the `metadata` account OR
///   it must be the program upgrade authority if the `metadata` account is canonical (see `is_program_authority`).
#[inline(always)]
fn validate_authority(
    metadata: &AccountInfo,
    authority: &AccountInfo,
    program: &AccountInfo,
    program_data: &AccountInfo,
) -> Result<(), ProgramError> {
    // Metadata checks.
    let header = unsafe { Header::load_unchecked(metadata.borrow_data_unchecked()) };
    if header.discriminator != AccountDiscriminator::Metadata as u8 {
        return Err(ProgramError::UninitializedAccount);
    }
    if !header.mutable() {
        // TODO: use custom error (immutable metadata account)
        return Err(ProgramError::InvalidAccountData);
    }

    // Authority checks.
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    // The authority is the set authority.
    let explicitly_authorized = match header.authority.as_ref() {
        Some(metadata_authority) => metadata_authority == authority.key(),
        None => false,
    };
    // The authority is the program upgrade authority for canonical metadata accounts.
    let authorized = explicitly_authorized
        || (header.canonical()
            && program.key() == &header.program
            && is_program_authority(program, program_data, authority.key())?);
    if !authorized {
        return Err(ProgramError::IncorrectAuthority);
    }

    Ok(())
}
