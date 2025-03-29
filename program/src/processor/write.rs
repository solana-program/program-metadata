use core::cmp::max;

use pinocchio::{
    account_info::AccountInfo, memory::sol_memcpy, program_error::ProgramError, ProgramResult,
};

use crate::state::{buffer::Buffer, header::Header, AccountDiscriminator};

/// Processor for the [`Write`](`crate::instruction::ProgramMetadataInstruction::Write`)
/// instruction.
pub fn write(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    let args = Write::try_from_bytes(instruction_data)?;
    let offset = args.offset() as usize + Buffer::LEN;

    // Access accounts.

    let [target_buffer, authority, source_buffer, _remaining @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.

    // authority
    // - must be a signer

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // target_buffer
    // - must be initialized
    // - must be rent exempt (pre-funded account) since we are reallocating the buffer
    //   account (this is tested implicity)

    let (required_length, source_data) = {
        // SAFETY: scoped immutable borrow of `buffer` account data. There
        // are no other borrows active.
        let data = unsafe { target_buffer.borrow_data_unchecked() };

        if data.is_empty() || data[0] != AccountDiscriminator::Buffer as u8 {
            return Err(ProgramError::InvalidAccountData);
        }

        // SAFETY: `buffer` account data is guaranteed to be a `Buffer`.
        let buffer_header = unsafe { Buffer::from_bytes_unchecked(data) };

        if Some(authority.key()) != buffer_header.authority.as_ref() {
            return Err(ProgramError::IncorrectAuthority);
        }

        // Determine from where to copy the data.
        let instruction_data = match args.data() {
            source_data if !source_data.is_empty() => Some(source_data),
            _ => None,
        };

        let buffer_data = if source_buffer.key() != &crate::ID {
            // SAFETY: singe immutable borrow of `source_buffer` account data.
            Some(unsafe { source_buffer.borrow_data_unchecked() })
        } else {
            None
        };

        let source_data = match (instruction_data, buffer_data) {
            (Some(instruction_data), None) => instruction_data,
            (None, Some(buffer_data)) => match AccountDiscriminator::try_from_bytes(buffer_data)? {
                Some(AccountDiscriminator::Buffer) => &buffer_data[Header::LEN..],
                _ => return Err(ProgramError::InvalidAccountData),
            },
            _ => return Err(ProgramError::InvalidInstructionData),
        };

        (max(data.len(), offset + source_data.len()), source_data)
    };

    // Writes the source data to the buffer account.

    target_buffer.realloc(required_length, false)?;
    // SAFETY: single mutable borrow of `buffer` account data. There
    // are no other borrows active.
    let data = unsafe { target_buffer.borrow_mut_data_unchecked() };

    unsafe {
        sol_memcpy(
            data.get_unchecked_mut(offset..),
            source_data,
            source_data.len(),
        );
    }

    Ok(())
}

/// Instruction data expected by the `Write` instruction.
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
        // - data (...n bytes, optional)
        if bytes.len() < 4 {
            return Err(ProgramError::InvalidInstructionData);
        }

        Ok(Write {
            offset: unsafe { &*(bytes.as_ptr() as *const [u8; 4]) },
            data: unsafe { bytes.get_unchecked(4..) },
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
