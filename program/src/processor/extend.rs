use core::mem::size_of;
use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::{buffer::Buffer, AccountDiscriminator};

use super::{validate_authority, validate_metadata};

/// Processor for the [`Extend`](`crate::instruction::ProgramMetadataInstruction::Extend`)
/// instruction.
#[allow(clippy::arithmetic_side_effects)]
pub fn extend(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    let extend_length = if instruction_data.len() != size_of::<u16>() {
        return Err(ProgramError::InvalidInstructionData);
    } else {
        // SAFETY: `instruction_data` is guranteed to have length equal to `2`.
        u16::from_le_bytes(unsafe { *(instruction_data.as_ptr() as *const [u8; 2]) })
    };

    // Access accounts.

    let [account, authority, program, program_data, _remaining @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.

    // account
    // - authority must be a signer (validated by `validate_authority`)
    // - must be a buffer or metadata account
    // - must have a valid authority
    // - must be rent exempt (pre-funded account) since we are reallocating the buffer
    //   account (this is tested implicity)

    if account.data_is_empty() {
        return Err(ProgramError::InvalidAccountData);
    } else {
        // SAFETY: single immutable borrow of `account` account data.
        let data = unsafe { account.borrow_data_unchecked() };
        // SAFETY: `account` is guaranteed to not be empty.
        let discriminator = unsafe { data.get_unchecked(0) };

        match AccountDiscriminator::try_from(*discriminator) {
            Ok(AccountDiscriminator::Buffer) => {
                let buffer = Buffer::from_bytes(data)?;
                validate_authority(buffer, authority, program, program_data)?
            }
            Ok(AccountDiscriminator::Metadata) => {
                let metadata = validate_metadata(account)?;
                validate_authority(metadata, authority, program, program_data)?
            }
            _ => return Err(ProgramError::InvalidAccountData),
        }
    }

    // Reallocates the account size.

    // The length of the data is never more than `10_000_000`; adding a `u16`
    // will never overflow the `usize` limit.
    account.realloc(account.data_len() + extend_length as usize, false)?;

    Ok(())
}
