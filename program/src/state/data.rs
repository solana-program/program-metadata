use core::{mem::align_of, str::from_utf8};

use pinocchio::{error::ProgramError, Address};

use super::{DataSource, ZeroableOption};

/// Represents the variable data associated with a metadata account.
pub enum Data<'a> {
    /// Data is stored directly on the account.
    Direct(DirectData<'a>),

    /// Data is stored externally and accessed via a URL.
    Url(UrlData<'a>),

    /// Data is stored in an external account.
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
                from_utf8(bytes).map_err(|_| ProgramError::InvalidArgument)?,
            )),
            DataSource::External => {
                if bytes.len() < ExternalData::LEN {
                    return Err(ProgramError::InvalidArgument);
                }
                if !(bytes.as_ptr() as usize).is_multiple_of(align_of::<ExternalData>()) {
                    return Err(ProgramError::InvalidArgument);
                }
                // SAFETY: `bytes` was validated to have the expected length
                // to hold a `Data::External` reference.
                Data::External(unsafe { &*(bytes.as_ptr() as *const ExternalData) })
            }
        })
    }
}

/// Type to represent inline data.
///
/// Inline data is stored directly in the account.
pub struct DirectData<'a>(pub &'a [u8]);

/// Type to represent URL data.
///
/// URL data is stored as a `str` value in the account.
pub struct UrlData<'a>(pub &'a str);

/// Type to represent external data.
///
/// External data contains a reference (address) to an external account
/// and an offset and an optional length to specify the data range.
//
// Note: `ExternalData` may be loaded directly from account data after
// only a length check (no owner check). All fields must be valid for any
// bit pattern.
#[repr(C)]
pub struct ExternalData {
    /// Address of the external account.
    pub address: Address,

    /// Offset of the data in the external account.
    ///
    /// Default to 0.
    pub offset: u32,

    /// Length of the data in the external account.
    ///
    /// Default to 0, which means the whole account.
    pub length: ZeroableOption<u32>,
}

// Enforces 4-byte alignment for the `ExternalData` struct.
const _: () = {
    assert!(align_of::<ExternalData>() == 4);
};

impl ExternalData {
    pub const LEN: usize = core::mem::size_of::<ExternalData>();
}
