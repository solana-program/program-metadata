use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::header::Header;

use super::{validate_authority, validate_metadata};

/// Processor for the [`SetImmutable`](`crate::instruction::ProgramMetadataInstruction::SetImmutable`)
/// instruction.
pub fn set_immutable(accounts: &[AccountInfo]) -> ProgramResult {
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

    let header = validate_metadata(metadata)?;

    // authority
    // - must be a signer
    // - must match the authority set on the `metadata` account OR it must be the
    //   program upgrade authority if the `metadata` account is canonical

    validate_authority(header, authority, program, program_data)?;

    // Make the metadata account immutable.

    // SAFETY: There are no active borrows of the `metadata` account data and the
    // account has been validated.
    let header = unsafe { Header::from_bytes_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

    if header.mutable() {
        header.mutable = 0;
    } else {
        // TODO: use custom error (metadata already immutable)
        return Err(ProgramError::InvalidAccountData);
    }

    Ok(())
}
