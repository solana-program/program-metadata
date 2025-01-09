pub mod data;
pub mod header;

use data::Data;
use header::Header;
use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

/// Struct to represent the contents of a `Metadata` account.
pub struct Metadata<'a> {
    /// The header of the metadata account.
    pub header: &'a Header,

    /// The data associated with the account.
    pub data: Data<'a>,
}

impl<'a> Metadata<'a> {
    pub fn load(bytes: &'a [u8]) -> Result<Self, ProgramError> {
        let header = Header::load(bytes)?;
        let data = Data::load(header.data_source()?, &bytes[Header::LEN..])?;
        Ok(Self { header, data })
    }

    pub(crate) unsafe fn load_unchecked(bytes: &'a [u8]) -> Self {
        let header = Header::load_unchecked(bytes);
        let data = Data::load_unchecked(header.data_source().unwrap(), &bytes[Header::LEN..]);
        Self { header, data }
    }
}

/// Account discriminators.
#[repr(u8)]
#[derive(Clone, Copy, Debug)]
pub enum AccountDiscriminator {
    Buffer,
    Metadata,
}

impl TryFrom<u8> for AccountDiscriminator {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(AccountDiscriminator::Buffer),
            1 => Ok(AccountDiscriminator::Metadata),
            _ => Err(ProgramError::InvalidAccountData),
        }
    }
}

/// Encoding types for associated data.
#[repr(u8)]
#[derive(Clone, Copy, Debug)]
pub enum Encoding {
    None,
    Utf8,
    Base58,
    Base64,
}

impl TryFrom<u8> for Encoding {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Encoding::None),
            1 => Ok(Encoding::Utf8),
            2 => Ok(Encoding::Base58),
            3 => Ok(Encoding::Base64),
            _ => Err(ProgramError::InvalidAccountData),
        }
    }
}

/// Compression formats for associated data.
#[repr(u8)]
#[derive(Clone, Copy, Debug)]
pub enum Compression {
    None,
    Gzip,
    Zstd,
}

impl TryFrom<u8> for Compression {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Compression::None),
            1 => Ok(Compression::Gzip),
            2 => Ok(Compression::Zstd),
            _ => Err(ProgramError::InvalidAccountData),
        }
    }
}

/// Formats for associated data.
#[repr(u8)]
#[derive(Clone, Copy, Debug)]
pub enum Format {
    None,
    Json,
    Yaml,
    Toml,
}

impl TryFrom<u8> for Format {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Format::None),
            1 => Ok(Format::Json),
            2 => Ok(Format::Yaml),
            3 => Ok(Format::Toml),
            _ => Err(ProgramError::InvalidAccountData),
        }
    }
}

/// Data sources for associated data.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DataSource {
    Direct,
    Url,
    External,
}

impl TryFrom<u8> for DataSource {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(DataSource::Direct),
            1 => Ok(DataSource::Url),
            2 => Ok(DataSource::External),
            _ => Err(ProgramError::InvalidAccountData),
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
    pub length: Zeroable<u32>,
}

impl ExternalData {
    const LEN: usize = core::mem::size_of::<ExternalData>();
}

pub trait Nullable: PartialEq + Sized {
    const NONE: Self;

    fn is_none(&self) -> bool {
        self == &Self::NONE
    }
}

impl Nullable for Pubkey {
    const NONE: Self = [0u8; core::mem::size_of::<Pubkey>()];
}

impl Nullable for u32 {
    const NONE: Self = 0;
}

#[derive(Clone, Debug)]
pub struct Zeroable<T: Nullable>(T);

impl<T: Nullable> Zeroable<T> {
    pub fn as_ref(&self) -> Option<&T> {
        if self.0.is_none() {
            None
        } else {
            Some(&self.0)
        }
    }

    pub fn as_mut(&mut self) -> Option<&mut T> {
        if self.0.is_none() {
            None
        } else {
            Some(&mut self.0)
        }
    }
}

impl<T: Nullable> From<T> for Zeroable<T> {
    fn from(value: T) -> Self {
        Self(value)
    }
}
