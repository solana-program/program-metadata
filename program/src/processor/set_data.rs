use pinocchio::{
    account_info::AccountInfo, memory::sol_memcpy, program_error::ProgramError, ProgramResult,
};

use crate::state::{
    header::Header, AccountDiscriminator, Compression, DataSource, Encoding, Format,
};

use super::{validate_authority, validate_metadata};

/// Update the data of a metadata account.
pub fn set_data(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let (args, remaining_data) = if instruction_data.len() < SetData::LEN {
        return Err(ProgramError::InvalidInstructionData);
    } else {
        let (args, remaining_data) = instruction_data.split_at(SetData::LEN);
        (unsafe { SetData::load_unchecked(args) }, remaining_data)
    };

    // Access accounts.
    let [metadata, authority, buffer, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate authority.
    let header = validate_metadata(metadata)?;
    validate_authority(header, authority, program, program_data)?;

    // Validate metadata account.
    let metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };
    match AccountDiscriminator::from_bytes(metadata_account_data)? {
        Some(AccountDiscriminator::Metadata) => (),
        _ => return Err(ProgramError::InvalidAccountData),
    }

    // Get data from buffer or remaining instruction data.
    let (data, has_buffer) = {
        let has_buffer = buffer.key() != &crate::ID;
        let has_remaining_data = !remaining_data.is_empty();
        let data = match (has_remaining_data, has_buffer) {
            (true, false) => Some(remaining_data),
            (false, true) => {
                let buffer_data = unsafe { buffer.borrow_data_unchecked() };
                match AccountDiscriminator::from_bytes(buffer_data)? {
                    Some(AccountDiscriminator::Buffer) => (),
                    _ => return Err(ProgramError::InvalidAccountData),
                }
                Some(&buffer_data[Header::LEN..])
            }
            (false, false) => None,
            _ => return Err(ProgramError::InvalidInstructionData),
        };
        (data, has_buffer)
    };

    // Update header.
    let header = unsafe { Header::load_mut_unchecked(metadata_account_data) };
    header.encoding = Encoding::try_from(args.encoding)? as u8;
    header.compression = Compression::try_from(args.compression)? as u8;
    header.format = Format::try_from(args.format)? as u8;

    // Update data.
    if let Some(data) = data {
        header.data_source = {
            let data_source = DataSource::try_from(args.data_source)?;
            data_source.validate_data_length(data.len())?;
            data_source as u8
        };
        header.data_length = (data.len() as u32).to_le_bytes();
        unsafe {
            sol_memcpy(&mut metadata_account_data[Header::LEN..], data, data.len());
        }
    }

    // Close the buffer by moving the lamports to the metadata account.
    if has_buffer {
        unsafe {
            let metadata_lamports = metadata.borrow_mut_lamports_unchecked();
            let buffer_lamports = buffer.borrow_mut_lamports_unchecked();
            // Move the buffer lamports to the metadata account.
            *metadata_lamports += *buffer_lamports;
            *buffer_lamports = 0;
        }
        buffer.close()?;
    };

    Ok(())
}

struct SetData {
    pub encoding: u8,
    pub compression: u8,
    pub format: u8,
    pub data_source: u8,
}

impl SetData {
    const LEN: usize = core::mem::size_of::<Self>();

    /// # Safety
    ///
    /// The `bytes` length is validated on the processor.
    pub(crate) unsafe fn load_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }
}
