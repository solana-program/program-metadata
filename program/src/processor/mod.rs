use pinocchio::{address::ADDRESS_BYTES, error::ProgramError, AccountView, Address};

use crate::{
    error::ProgramMetadataError,
    state::{header::Header, Account, AccountDiscriminator},
};

pub mod allocate;
pub mod close;
pub mod extend;
pub mod initialize;
pub mod set_authority;
pub mod set_data;
pub mod set_immutable;
pub mod trim;
pub mod write;

/// The program ID of the SVM Loader `v3`.
const BPF_LOADER_UPGRABABLE_ID: Address = Address::new_from_array([
    2, 168, 246, 145, 78, 136, 161, 176, 226, 16, 21, 62, 247, 99, 174, 43, 0, 194, 185, 61, 22,
    193, 36, 210, 192, 83, 122, 16, 4, 128, 0, 0,
]);

/// Checks if the provided `authority` is the authority allowed to update the `program`.
/// Fails when providing unexpected input.
///
/// The following validation checks are performed:
///
/// - `program` account must be executable.
///
/// - When a program is owned by SVM Loader `v2`, program must match the authority;
///   otherwise, the `program_data` account must be provided.
///
/// For SVM Loader `v2` programs:
///
/// - `program` account discriminator (first byte) must be `2`, i.e., defining a
///   `Program` account.
///
/// - `program_data` account must be the one set on the `program` account data.
///
/// - `program_data` account discriminator (first byte) must be `3`, i.e., defining
///   a `ProgramData` account.
///
/// - `program_data` account must have 32 bytes of data in the range `[13..45]`,
///   matching the provided `authority`.
#[allow(clippy::arithmetic_side_effects)]
#[inline(always)]
fn is_program_authority(
    program: &AccountView,
    program_data: &AccountView,
    authority: &Address,
) -> Result<bool, ProgramError> {
    // For BPFv1 and BPF Loader v2 programs, there is no program data associated. In this case,
    // the keypair used to deploy the program must be the authority and sign the transaction.
    if !program.owned_by(&BPF_LOADER_UPGRABABLE_ID) {
        return Ok(program.executable() && program.address() == authority);
    }

    // For BPFv3 programs, we need the program data account to check the auhtority.
    if program_data.address() == &crate::ID {
        return Ok(false);
    }

    let expected_program_data = {
        let data = unsafe { program.borrow_unchecked() };
        match (data.first(), program.executable()) {
            (Some(2 /* program discriminator */), true) => {
                let offset: usize = 4 /* discriminator */;
                Address::try_from(&data[offset..offset + ADDRESS_BYTES])
                    .map_err(|_| ProgramError::InvalidAccountData)?
            }
            _ => {
                return Err(ProgramMetadataError::InvalidProgramState.into());
            }
        }
    };

    // Program <-> Program Data check.
    if expected_program_data != *program_data.address() {
        return Err(ProgramMetadataError::InvalidProgramDataAccount.into());
    }

    // Program Data checks.
    let is_program_authority = {
        let data = unsafe { program_data.borrow_unchecked() };
        match (data.first(), program_data.executable()) {
            (Some(3 /* program data discriminator */), false) => {
                let option_offset: usize = 4 /* discriminator */ + 8 /* slot */;
                if data[option_offset] == 1 {
                    let pubkey_offset: usize = option_offset + 1 /* option */;
                    // The `authority_key` is a `Pubkey`.
                    let authority_key =
                        Address::try_from(&data[pubkey_offset..pubkey_offset + ADDRESS_BYTES])
                            .map_err(|_| ProgramError::InvalidAccountData)?;
                    authority == &authority_key
                } else {
                    false
                }
            }
            _ => {
                return Err(ProgramMetadataError::InvalidProgramState.into());
            }
        }
    };

    Ok(is_program_authority)
}

/// Ensures the `metadata` account is valid and mutable.
///
/// The following validation checks are performed:
///
/// - The `metadata` account discriminator (first byte) must
///   be [`AccountDiscriminator::Metadata`].
/// - The `metadata` account must be mutable (`mutable = true`).
#[inline(always)]
fn validate_metadata(metadata: &AccountView) -> Result<&Header, ProgramError> {
    let header = unsafe { Header::from_bytes_unchecked(metadata.borrow_unchecked()) };
    if header.discriminator != AccountDiscriminator::Metadata as u8 {
        return Err(ProgramError::UninitializedAccount);
    }
    if !header.mutable() {
        return Err(ProgramMetadataError::ImmutableMetadataAccount.into());
    }
    Ok(header)
}

/// Ensures the `metadata` account can be updated by the provided `authority`.
///
/// The following validation checks are performed:
///
/// - `authority` account must be a signer.
/// - `authority` account must match the authority set on the `metadata`
///   account OR it must be the program upgrade authority if the `metadata`
///   account is canonical (see `is_program_authority`).
#[inline(always)]
fn validate_authority<T: Account>(
    account: &T,
    authority: &AccountView,
    program: &AccountView,
    program_data: &AccountView,
) -> Result<(), ProgramError> {
    // Authority checks.
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // The authority is the set authority.
    let explicitly_authorized = match account.get_authority() {
        Some(metadata_authority) => metadata_authority == authority.address(),
        None => false,
    };

    // The authority is the program upgrade authority for canonical metadata accounts.
    let authorized = explicitly_authorized
        || (account.is_canonical(program.address())
            && is_program_authority(program, program_data, authority.address())?);

    if !authorized {
        Err(ProgramError::IncorrectAuthority)
    } else {
        Ok(())
    }
}

#[inline(always)]
fn derive_program_address<const N: usize>(
    seeds: &[&[u8]; N],
    program_id: &Address,
) -> (Address, u8) {
    Address::derive_program_address(seeds, program_id)
        .expect("Unable to find a viable program address bump seed")
}
