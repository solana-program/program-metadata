use core::cmp::max;

use pinocchio::{
    error::ProgramError,
    sysvars::{rent::Rent, Sysvar},
    AccountView, ProgramResult, Resize,
};

use crate::state::{buffer::Buffer, header::Header, AccountDiscriminator};

/// Processor for the [`Write`](`crate::instruction::ProgramMetadataInstruction::Write`)
/// instruction.
#[allow(clippy::arithmetic_side_effects)]
pub fn write(accounts: &mut [AccountView], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    let args = Write::try_from_bytes(instruction_data)?;
    // The `offset` value is guaranteed to fit in a `usize`.
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
    //   account

    let (required_length, source_data) = {
        // SAFETY: scoped immutable borrow of `buffer` account data. There
        // are no other borrows active.
        let data = unsafe { target_buffer.borrow_unchecked() };

        if data.is_empty() || data[0] != AccountDiscriminator::Buffer as u8 {
            return Err(ProgramError::InvalidAccountData);
        }

        // SAFETY: `buffer` account data is guaranteed to be a `Buffer`.
        let buffer_header = unsafe { Buffer::from_bytes_unchecked(data) };

        if Some(authority.address()) != buffer_header.authority.as_ref() {
            return Err(ProgramError::IncorrectAuthority);
        }

        // Determine from where to copy the data.
        let instruction_data = match args.data() {
            source_data if !source_data.is_empty() => Some(source_data),
            _ => None,
        };

        let buffer_data = if source_buffer.address() != &crate::ID {
            // SAFETY: singe immutable borrow of `source_buffer` account data.
            Some(unsafe { source_buffer.borrow_unchecked() })
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

        // The length of the data to write is validated by the `try_minimum_balance`.
        (max(data.len(), offset + source_data.len()), source_data)
    };

    let minimum_balance = Rent::get()?.try_minimum_balance(required_length)?;

    if target_buffer.lamports() < minimum_balance {
        return Err(ProgramError::AccountNotRentExempt);
    }

    // Writes the source data to the buffer account.

    // SAFETY: `target_buffer` account is not borrowed at this point.
    unsafe { target_buffer.resize_unchecked(required_length)? };

    // SAFETY: single mutable borrow of `buffer` account data. There
    // are no other borrows active.
    let data = unsafe { target_buffer.borrow_unchecked_mut() };

    unsafe {
        core::ptr::copy_nonoverlapping(
            source_data.as_ptr(),
            data.get_unchecked_mut(offset..).as_mut_ptr(),
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
    pub fn try_from_bytes(bytes: &[u8]) -> Result<Write<'_>, ProgramError> {
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
