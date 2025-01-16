use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

use super::{
    AccountDiscriminator, Compression, DataSource, Encoding, Format, PdaInfo, ZeroableOption,
    SEED_LEN,
};

/// Metadata account header.
#[repr(C)]
pub struct Header {
    /// Account discriminator.
    pub(crate) discriminator: u8,

    /// Program ID that this metadata is associated with.
    pub program: Pubkey,

    /// Authority that can update this metadata.
    ///
    /// For canonical metadata accounts, the authority can be `None`.
    pub authority: ZeroableOption<Pubkey>,

    /// Indicates whether the metadata is mutable.
    pub(crate) mutable: u8,

    /// Indicates whether the metadata is canonical.
    ///
    /// Canonical metadata accounts are accounts created by the
    /// program upgrade authority.
    pub(crate) canonical: u8,

    /// Seed used to derive the PDA.
    pub seed: [u8; SEED_LEN],

    /// Encoding of the data.
    pub(crate) encoding: u8,

    /// Compression of the data.
    pub(crate) compression: u8,

    /// Format of the data.
    pub(crate) format: u8,

    /// Source of the data.
    pub(crate) data_source: u8,

    // Length of the data after the header.
    pub(crate) data_length: [u8; 4],

    // Extra padding for alignment.
    _padding: [u8; 5],
}

impl Header {
    pub const LEN: usize = core::mem::size_of::<Header>(); // 96 bytes

    pub fn discriminator(&self) -> Result<AccountDiscriminator, ProgramError> {
        self.discriminator.try_into()
    }

    pub fn mutable(&self) -> bool {
        self.mutable != 0
    }

    pub fn canonical(&self) -> bool {
        self.canonical != 0
    }

    pub fn encoding(&self) -> Result<Encoding, ProgramError> {
        self.encoding.try_into()
    }

    pub fn compression(&self) -> Result<Compression, ProgramError> {
        self.compression.try_into()
    }

    pub fn format(&self) -> Result<Format, ProgramError> {
        self.format.try_into()
    }

    pub fn data_source(&self) -> Result<DataSource, ProgramError> {
        self.data_source.try_into()
    }

    pub fn data_length(&self) -> u32 {
        u32::from_le_bytes(self.data_length)
    }

    pub fn load(bytes: &[u8]) -> Result<&Self, ProgramError> {
        if bytes.len() < Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(unsafe { Self::load_unchecked(bytes) })
    }

    pub(crate) unsafe fn load_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }

    pub fn load_mut(bytes: &mut [u8]) -> Result<&mut Self, ProgramError> {
        if bytes.len() < Self::LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(unsafe { Self::load_mut_unchecked(bytes) })
    }

    pub(crate) unsafe fn load_mut_unchecked(bytes: &mut [u8]) -> &mut Self {
        &mut *(bytes.as_mut_ptr() as *mut Self)
    }
}

impl PdaInfo for Header {
    fn program(&self) -> &Pubkey {
        &self.program
    }

    fn authority(&self) -> Option<&Pubkey> {
        self.authority.as_ref()
    }

    fn is_canonical(&self) -> bool {
        self.canonical()
    }
}
