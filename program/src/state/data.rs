use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

use super::{DataSource, ZeroableOption};

/// Metadata account data.
pub enum Data<'a> {
    Direct(DirectData<'a>),
    Url(UrlData<'a>),
    External(&'a ExternalData),
}

impl<'a> Data<'a> {
    /// Return a `Data` from the given bytes.
    ///
    /// This method validates that `bytes` has at least the minimum required
    /// length.
    pub fn from_bytes(data_source: DataSource, bytes: &'a [u8]) -> Result<Data<'a>, ProgramError> {
        Ok(match data_source {
            DataSource::Direct => Data::Direct(DirectData(bytes)),
            DataSource::Url => Data::Url(UrlData(
                core::str::from_utf8(bytes).map_err(|_| ProgramError::InvalidArgument)?,
            )),
            DataSource::External => {
                if bytes.len() < ExternalData::LEN {
                    return Err(ProgramError::InvalidArgument);
                }
                // SAFETY: `bytes` was validated to have the expected length
                // to hold a `Data::External` reference.
                Data::External(unsafe { &*(bytes.as_ptr() as *const ExternalData) })
            }
        })
    }

    /// Return a `Data` from the given bytes.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `bytes` contains a valid representation of `Data`.
    pub(crate) unsafe fn from_bytes_unchecked(
        data_source: DataSource,
        bytes: &'a [u8],
    ) -> Data<'a> {
        match data_source {
            DataSource::Direct => Data::Direct(DirectData(bytes)),
            DataSource::Url => Data::Url(UrlData(core::str::from_utf8_unchecked(bytes))),
            DataSource::External => Data::External(&*(bytes.as_ptr() as *const ExternalData)),
        }
    }
}

/// Type to represent inlined data.
///
/// Inlined data is stored directly in the account.
pub struct DirectData<'a>(pub &'a [u8]);

/// Type to represent URL data.
///
/// URL data is stored as a `str` value in the account.
pub struct UrlData<'a>(pub &'a str);

/// Type to represent external data.
///
/// External data contains a reference (address) to an external account
/// and an offset and an optional length to specify the data range.
pub struct ExternalData {
    /// Pubkey of the external account.
    pub address: Pubkey,

    /// Offset of the data in the external account.
    ///
    /// Default to 0.
    pub offset: u32,

    /// Length of the data in the external account.
    ///
    /// Default to 0, which means the whole account.
    pub length: ZeroableOption<u32>,
}

impl ExternalData {
    pub const LEN: usize = core::mem::size_of::<ExternalData>();
}
