use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

use super::{DataSource, ZeroableOption};

/// Metadata account data.
pub enum Data<'a> {
    Direct(DirectData<'a>),
    Url(UrlData<'a>),
    External(&'a ExternalData),
}

impl<'a> Data<'a> {
    pub fn load(data_source: DataSource, bytes: &'a [u8]) -> Result<Data<'a>, ProgramError> {
        Ok(match data_source {
            DataSource::Direct => Data::Direct(DirectData(bytes)),
            DataSource::Url => Data::Url(UrlData(
                core::str::from_utf8(bytes).map_err(|_| ProgramError::InvalidAccountData)?,
            )),
            DataSource::External => {
                if bytes.len() < ExternalData::LEN {
                    return Err(ProgramError::InvalidAccountData);
                }
                Data::External(unsafe { &*(bytes.as_ptr() as *const ExternalData) })
            }
        })
    }

    pub(crate) unsafe fn load_unchecked(data_source: DataSource, bytes: &'a [u8]) -> Data<'a> {
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
