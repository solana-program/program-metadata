use pinocchio::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

use crate::state::{header::Header, AccountDiscriminator};

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
/// - [explicit] The `program_data` account must be the one set on the `program` account data.
/// - [explicit] The `program_data` account must not be executable.
/// - [explicit] The `program_data` account discriminator (first byte) must be `3` — i.e. defining a `ProgramData` account.
/// - [explicit] The `program_data` account must have 32 bytes of data in the range [13..45], representing the authority.
#[inline(always)]
fn is_program_authority(
    program: &AccountInfo,
    program_data: &AccountInfo,
    authority: &Pubkey,
) -> Result<bool, ProgramError> {
    // Program checks.
    let expected_program_data = {
        let data = unsafe { program.borrow_data_unchecked() };
        match (data.first(), program.executable()) {
            (Some(2 /* program discriminator */), true) => {
                let offset: usize = 4 /* discriminator */;
                Pubkey::try_from(data[offset..]).map_err(|_| ProgramError::InvalidAccountData)?
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
                // TODO(loris): Should we handle the `None` case? If so, we just need to return `false`.
                let offset: usize = 4 /* discriminator */ + 8 /* slot */ + 1 /* option */;
                let authority_key = Pubkey::try_from(data[offset..])
                    .map_err(|_| ProgramError::InvalidAccountData)?;
                authority == &authority_key
            }
            _ => {
                // TODO: use custom error (invalid program state)
                return Err(ProgramError::InvalidAccountData);
            }
        }
    };

    Ok(is_program_authority)
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
