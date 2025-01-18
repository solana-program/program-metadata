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
    if instruction_data.len() < SetData::LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    let args = unsafe { SetData::load_unchecked(&instruction_data[..SetData::LEN]) };
    let optional_data =
        instruction_data[SetData::LEN..]
            .split_first()
            .map(
                |(data_source, remaining_data)| match remaining_data.is_empty() {
                    true => (data_source, None),
                    false => (data_source, Some(remaining_data)),
                },
            );

    // Access accounts.
    let [metadata, authority, buffer, program, program_data, _remaining @ ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate metadata and authority.
    let header = validate_metadata(metadata)?;
    validate_authority(header, authority, program, program_data)?;

    // Get data from buffer or remaining instruction data, if any.
    let has_buffer = buffer.key() != &crate::ID;
    let data = match (optional_data, has_buffer) {
        (Some((data_source, Some(remaining_data))), false) => Some((data_source, remaining_data)),
        (Some((data_source, None)), true) => {
            let buffer_data = unsafe { buffer.borrow_data_unchecked() };
            match AccountDiscriminator::from_bytes(buffer_data)? {
                Some(AccountDiscriminator::Buffer) => (),
                _ => return Err(ProgramError::InvalidAccountData),
            }
            Some((data_source, &buffer_data[Header::LEN..]))
        }
        (None, false) => None,
        _ => return Err(ProgramError::InvalidInstructionData),
    };

    // Update header.
    let metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };
    let header = unsafe { Header::from_bytes_mut_unchecked(metadata_account_data) };
    header.encoding = Encoding::try_from(args.encoding)? as u8;
    header.compression = Compression::try_from(args.compression)? as u8;
    header.format = Format::try_from(args.format)? as u8;

    // Update data.
    if let Some((data_source, data)) = data {
        // Adjust the data source and length in the header.
        let data_length = data.len();
        header.data_source = {
            let data_source = DataSource::try_from(*data_source)?;
            data_source.validate_data_length(data_length)?;
            data_source as u8
        };
        header.data_length = (data_length as u32).to_le_bytes();

        // Realloc the metdata account if necessary.
        metadata.realloc(Header::LEN + data_length, false)?;

        // Copy the new data to the metadata account.
        unsafe {
            sol_memcpy(&mut metadata_account_data[Header::LEN..], data, data_length);
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
    // data_source: u8,
    // remaining_data: &[u8],
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
