use core::cmp::max;

use pinocchio::{
    account_info::AccountInfo, memory::sol_memcpy, program_error::ProgramError, ProgramResult,
};

use crate::state::{buffer::Buffer, AccountDiscriminator};

/// Processor for the [`Write`](`crate::instruction::ProgramMetadataInstruction::Write`)
/// instruction.
pub fn write(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    let args = Write::try_from_bytes(instruction_data)?;
    let offset = args.offset() as usize + Buffer::LEN;

    // Access accounts.

    let [buffer, authority, _remaining @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.

    // authority
    // - must be a signer

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // buffer
    // - must be initialized
    // - must be rent exempt (pre-funded account) since we are reallocating the buffer
    //   account (this is tested implicity)

    let required_length = {
        // SAFETY: scoped immutable borrow of `buffer` account data. There
        // are no other borrows active.
        let data = unsafe { buffer.borrow_data_unchecked() };

        if data.is_empty() || data[0] != AccountDiscriminator::Buffer as u8 {
            return Err(ProgramError::InvalidAccountData);
        }

        // SAFETY: `buffer` account data is guaranteed to be a `Buffer`.
        let buffer_header = unsafe { Buffer::from_bytes_unchecked(data) };

        if Some(authority.key()) != buffer_header.authority.as_ref() {
            return Err(ProgramError::IncorrectAuthority);
        }

        max(data.len(), offset + args.data().len())
    };

    // Writes the instruction data to the buffer account.

    buffer.realloc(required_length, false)?;
    // SAFETY: single mutable borrow of `buffer` account data. There
    // are no other borrows active.
    let data = unsafe { buffer.borrow_mut_data_unchecked() };
    let instruction_data = args.data();

    unsafe {
        sol_memcpy(
            &mut data[offset..],
            instruction_data,
            instruction_data.len(),
        );
    }

    Ok(())
}

/// Instruction data expected by the [`Write`](`crate::instruction::ProgramMetadataInstruction::Write`).
struct Write<'a> {
    /// Offset to write to.
    offset: &'a [u8; 4],

    /// Bytes to write.
    data: &'a [u8],
}

impl Write<'_> {
    #[inline]
    pub fn try_from_bytes(bytes: &[u8]) -> Result<Write, ProgramError> {
        // The minimum expected size of the instruction data.
        // - offset (4 bytes)
        // - data (...n bytes)
        if bytes.len() < 5 {
            return Err(ProgramError::InvalidInstructionData);
        }

        Ok(Write {
            offset: unsafe { &*(bytes.as_ptr() as *const [u8; 4]) },
            data: &bytes[4..],
        })
    }

    #[inline]
    pub fn offset(&self) -> u32 {
        u32::from_le_bytes(*self.offset)
    }

    #[inline]
    pub fn data(&self) -> &[u8] {
        self.data
    }
}
