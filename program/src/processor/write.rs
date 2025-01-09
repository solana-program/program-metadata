use pinocchio::{
    account_info::AccountInfo, memory::sol_memcpy, program_error::ProgramError, ProgramResult,
};

use crate::state::{header::Header, AccountDiscriminator};

/// Writes data to a buffer account.
pub fn write(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    let [buffer] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.

    // buffer
    // - explicit signer check
    // - implicit rent exemption check since we are reallocating the account
    //   (it will fail if the account is not pre-funded for the required space)
    // - implicit program owned and writable check since we are writing to the
    //   account (it will fail if the account is not assigned to the program)

    if !buffer.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let (offset, set_discriminator) = {
        if buffer.data_is_empty() {
            (Header::LEN, true)
        } else {
            let data = unsafe { buffer.borrow_mut_data_unchecked() };

            if data[0] == AccountDiscriminator::Buffer as u8 {
                (buffer.data_len(), false)
            } else {
                return Err(ProgramError::InvalidAccountData);
            }
        }
    };

    // Make space for the instruction data.
    buffer.realloc(offset + instruction_data.len(), false)?;

    let data = unsafe { buffer.borrow_mut_data_unchecked() };

    // Set the account discriminator if needed.
    if set_discriminator {
        data[0] = AccountDiscriminator::Buffer as u8;
    }

    unsafe {
        sol_memcpy(
            &mut data[offset..],
            instruction_data,
            instruction_data.len(),
        );
    }

    Ok(())
}
