pub mod buffer;
pub mod data;
pub mod header;

use data::{Data, ExternalData};
use header::Header;
use pinocchio::{program_error::ProgramError, pubkey::Pubkey, ProgramResult};

/// The length of the seed used to derive the metadata account address.
pub const SEED_LEN: usize = 16;

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

/// Trait representing the common information of a PDA account.
pub(crate) trait PdaInfo {
    /// The program that this PDA is associated with.
    fn program(&self) -> Option<&Pubkey>;

    /// The (optional) authority of the PDA.
    fn authority(&self) -> Option<&Pubkey>;

    /// Indicates whether the PDA represents a canonical PDA for
    /// the program.
    fn is_canonical(&self) -> bool;
}

/// Account discriminators.
#[repr(u8)]
#[derive(Clone, Copy, Debug)]
pub enum AccountDiscriminator {
    Empty,
    Buffer,
    Metadata,
}

impl AccountDiscriminator {
    pub fn from_bytes(bytes: &[u8]) -> Result<Option<AccountDiscriminator>, ProgramError> {
        if bytes.is_empty() {
            Ok(None)
        } else {
            Ok(Some(AccountDiscriminator::try_from(bytes[0])?))
        }
    }
}

impl TryFrom<u8> for AccountDiscriminator {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(AccountDiscriminator::Empty),
            1 => Ok(AccountDiscriminator::Buffer),
            2 => Ok(AccountDiscriminator::Metadata),
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

impl DataSource {
    #[inline(always)]
    pub fn validate_data_length(&self, length: usize) -> ProgramResult {
        match (self, length) {
            (DataSource::Direct | DataSource::Url, l) if l > 0 => Ok(()),
            (DataSource::External, ExternalData::LEN) => Ok(()),
            _ => {
                // TODO: use custom error (invalid data length)
                Err(ProgramError::InvalidAccountData)
            }
        }
    }
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

pub trait Zeroable: PartialEq + Sized {
    const ZERO: Self;

    fn is_zero(&self) -> bool {
        self == &Self::ZERO
    }
}

impl Zeroable for Pubkey {
    const ZERO: Self = [0u8; core::mem::size_of::<Pubkey>()];
}

impl Zeroable for u32 {
    const ZERO: Self = 0;
}

#[derive(Clone, Debug)]
pub struct ZeroableOption<T: Zeroable>(T);

impl<T: Zeroable> ZeroableOption<T> {
    pub fn as_ref(&self) -> Option<&T> {
        if self.0.is_zero() {
            None
        } else {
            Some(&self.0)
        }
    }

    pub fn as_mut(&mut self) -> Option<&mut T> {
        if self.0.is_zero() {
            None
        } else {
            Some(&mut self.0)
        }
    }
}

impl<T: Zeroable> From<T> for ZeroableOption<T> {
    fn from(value: T) -> Self {
        Self(value)
    }
}
