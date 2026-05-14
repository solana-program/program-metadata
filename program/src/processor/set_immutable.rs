use pinocchio::{account::AccountView, error::ProgramError, ProgramResult};

use crate::state::header::Header;

use super::{validate_authority, validate_metadata};

/// Processor for the [`SetImmutable`](`crate::instruction::ProgramMetadataInstruction::SetImmutable`)
/// instruction.
pub fn set_immutable(accounts: &mut [AccountView]) -> ProgramResult {
    // Access accounts.

    let [metadata, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.
    //
    // Note that program owned and writable checks are done implicitly by writing
    // to the account.

    // metadata
    // - must be initialized
    // - must be mutable

    // SAFETY: There are no active borrows of the `metadata` account data.
    let metadata_account_data = unsafe { metadata.borrow_unchecked_mut() };
    let header = validate_metadata(metadata_account_data)?;

    // authority
    // - must be a signer
    // - must match the authority set on the `metadata` account OR it must be the
    //   program upgrade authority if the `metadata` account is canonical

    validate_authority(header, authority, program, program_data)?;

    // Make the metadata account immutable.

    // SAFETY: `metadata_account_data` has been validated to be initialized
    // and mutable.
    let header = unsafe { Header::from_bytes_mut_unchecked(metadata_account_data) };
    header.mutable = 0;

    Ok(())
}
