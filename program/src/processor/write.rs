use pinocchio::{
    account_info::AccountInfo, memory::sol_memcpy, program_error::ProgramError, ProgramResult,
};

use crate::state::{buffer::Buffer, AccountDiscriminator};

/// Writes data to a buffer account.
///
/// ## Validation
/// The following validation checks are performed:
pub fn write(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    let [buffer, authority, _remaining @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.

    // authority
    // - explicit signer check

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // account
    // - implicit rent exemption check since we are reallocating the account
    //   (it will fail if the account is not pre-funded for the required space)
    // - implicit program owned and writable check since we are writing to the
    //   account (it will fail if the account is not assigned to the program)

    if buffer.data_is_empty() {
        return Err(ProgramError::InvalidAccountData);
    }

    let data = unsafe { buffer.borrow_mut_data_unchecked() };

    let offset = if data[0] == AccountDiscriminator::Buffer as u8 {
        buffer.data_len()
    } else {
        return Err(ProgramError::InvalidAccountData);
    };

    // If the authority is not the buffer account, the buffer account is a
    // PDA and signer authority must match the buffer authority.
    if buffer.key() != authority.key() {
        let buffer_header = unsafe { Buffer::from_bytes_unchecked(data) };
        if Some(authority.key()) != buffer_header.authority.as_ref() {
            return Err(ProgramError::IncorrectAuthority);
        }
    }

    // Must have instruction data.
    if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Make space for the instruction data.
    buffer.realloc(offset + instruction_data.len(), false)?;
    // Refresh the data reference after realloc.
    let data = unsafe { buffer.borrow_mut_data_unchecked() };

    unsafe {
        sol_memcpy(
            &mut data[offset..],
            instruction_data,
            instruction_data.len(),
        );
    }

    Ok(())
}
