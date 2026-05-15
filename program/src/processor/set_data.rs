use pinocchio::{account::AccountView, error::ProgramError, ProgramResult, Resize};

use crate::state::{
    header::Header, AccountDiscriminator, Compression, DataSource, Encoding, Format,
};

use super::{validate_authority, validate_metadata};

/// Processor for the [`SetData`](`crate::instruction::ProgramMetadataInstruction::SetData`)
/// instruction.
#[allow(clippy::arithmetic_side_effects)]
pub fn set_data(accounts: &mut [AccountView], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    if instruction_data.len() < SetData::LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    // SAFETY: The length of the instruction data is validated above to
    // be at least `SetData::LEN`.
    let args = unsafe { SetData::load_unchecked(instruction_data.get_unchecked(..SetData::LEN)) };

    // SAFETY: The length of the instruction data is validated above to
    // be at least `SetData::LEN`
    let optional_data = unsafe { instruction_data.get_unchecked(SetData::LEN..) }
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

    // Account validation.
    //
    // Note that program owned and writable checks are done implicitly by writing
    // to the account.
    {
        // metadata
        // - must be initialized
        // - must be mutable

        // SAFETY: Scoped immutable borrow of `metadata` account data for validation.
        let metadata_account_data = unsafe { metadata.borrow_unchecked() };
        let header = validate_metadata(metadata_account_data)?;

        // authority
        // - must be a signer
        // - must match the authority set on the `metadata` account OR it must be the
        //   program upgrade authority if the `metadata` account is canonical

        validate_authority(header, authority, program, program_data)?;
    }

    // buffer (if `remaining_data` is `None`)
    // - must be initialized
    // - must be owned by the program
    //
    // Get data from buffer or remaining instruction data (if any).
    let data = match (optional_data, buffer.address() != &crate::ID) {
        (Some((data_source, Some(remaining_data))), false) => Some((data_source, remaining_data)),
        (Some((data_source, None)), true) => {
            // Since we are not writing to the `buffer` account, validate
            // the ownership of the account.
            if !buffer.owned_by(&crate::ID) {
                return Err(ProgramError::InvalidAccountOwner);
            }
            // SAFETY: single immutable borrow of `buffer` account data.
            let buffer_data = unsafe { buffer.borrow_unchecked() };

            match AccountDiscriminator::try_from_bytes(buffer_data)? {
                Some(AccountDiscriminator::Buffer) => {
                    Some((data_source, &buffer_data[Header::LEN..]))
                }
                _ => return Err(ProgramError::InvalidAccountData),
            }
        }
        (None, false) => None,
        _ => return Err(ProgramError::InvalidInstructionData),
    };

    // Update header and data (if needed).

    if let Some(data) = update_header(metadata, args, data)? {
        // Realloc the metadata account if necessary.

        // SAFETY: There are no other active borrows to the `metadata` account data.
        //
        // The `resize_unchecked` validates that the new size does not exceed the
        // maximum permitted data increase. Since the data comes either from the
        // instruction data or from a buffer account, it is guranteed to be within
        // the maximum data length. The runtime also enforces that the total size
        // of the account data after resizing does not exceed the maximum account
        // length.
        unsafe { metadata.resize_unchecked(Header::LEN + data.len())? };

        // SAFETY: There are no other active borrows to the `metadata`
        // account data and the account has been reallocated to accommodate
        // the new data.
        unsafe {
            core::ptr::copy_nonoverlapping(
                data.as_ptr(),
                metadata
                    .borrow_unchecked_mut()
                    .get_unchecked_mut(Header::LEN..)
                    .as_mut_ptr(),
                data.len(),
            );
        }
    }

    Ok(())
}

/// Updates the metadata header with the provided arguments and data.
#[inline(always)]
fn update_header<'a>(
    metadata: &mut AccountView,
    args: &SetData,
    data: Option<(&'a u8, &'a [u8])>,
) -> Result<Option<&'a [u8]>, ProgramError> {
    // SAFETY: There are no other active borrows to the `metadata` account data.
    let metadata_account_data = unsafe { metadata.borrow_unchecked_mut() };
    // SAFETY: `metadata` is validated to be initialized and mutable.
    let header = unsafe { Header::from_bytes_mut_unchecked(metadata_account_data) };

    header.encoding = Encoding::try_from(args.encoding)? as u8;
    header.compression = Compression::try_from(args.compression)? as u8;
    header.format = Format::try_from(args.format)? as u8;

    // Update data.

    if let Some((data_source, data)) = data {
        // Adjust the data source and length in the header.
        header.data_source = {
            let data_source = DataSource::try_from(*data_source)?;
            data_source.validate_data_length(data.len())?;
            data_source as u8
        };
        header.data_length = (data.len() as u32).to_le_bytes();

        Ok(Some(data))
    } else {
        Ok(None)
    }
}

/// The instruction data for the `SetData` instruction.
struct SetData {
    pub encoding: u8,
    pub compression: u8,
    pub format: u8,
    // optional data:
    // - `u8`: data_source
    // - `&[u8]`: remaining data
}

impl SetData {
    const LEN: usize = core::mem::size_of::<Self>();

    /// # Safety
    ///
    /// The `bytes` length is validated on the processor.
    #[inline(always)]
    pub(crate) unsafe fn load_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }
}
