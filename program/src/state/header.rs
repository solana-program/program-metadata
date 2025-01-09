// Canonical + Authority x and program_authority allowed to update Metadata
// -> [authority = Some(x)] [mutable = true] [canonical = true]
// Canonical + Only program_authority allowed to update Metadata (Could end up immutable as well)
// -> [authority = None] [mutable = true] [canonical = true]
// Canonical + No authority allowed to update Metadata
// -> [authority = None] [mutable = false] [canonical = true]

// NEVER REACHED:
// -> [authority = Some(x)] [mutable = false] [canonical = true]
// Cleaned by the program.

// Third-party + Only authority x allowed to update Metadata
// -> [authority = Some(x)] [mutable = true] [canonical = false]
// Third-party + No authority allowed to update Metadata
// -> [authority = Some(x)] [mutable = false] [canonical = false]

// NEVER REACHED:
// -> [authority = None] [mutable = _] [canonical = true]
// Third-party should always have the seed authority set.

use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

use super::{AccountDiscriminator, Compression, DataSource, Encoding, Format, Zeroable};

/// Metadata account header.
#[repr(C)]
pub struct Header {
    /// Account discriminator.
    pub discriminator: u8,

    /// Program ID that this metadata is associated with.
    pub program: Pubkey,

    /// Authority that can update this metadata.
    ///
    /// For canonical metadata accounts, the authority can be `None`.
    pub authority: Zeroable<Pubkey>,

    /// Indicates whether the metadata is mutable.
    pub(crate) mutable: u8,

    /// Indicates whether the metadata is canonical.
    ///
    /// Canonical metadata accounts are accounts created by the
    /// program upgrade authority.
    pub(crate) canonical: u8,

    /// Seed used to derive the PDA.
    pub seed: [u8; 17],

    /// Encoding of the data.
    pub(crate) encoding: u8,

    /// Compression of the data.
    pub(crate) compression: u8,

    /// Format of the data.
    pub(crate) format: u8,

    /// Source of the data.
    pub(crate) data_source: u8,
}

// (A: Canonical PDA) signer === program_authority => [program, seed ("idl")]
// -> create: signer === program_authority (data.mutable_authority = false)
// -> update: signer === program_authority || signer === metadata.authority
// -> close: signer === program_authority || signer === metadata.authority
// -> set_authority: signer === program_authority || signer === metadata.authority

// (B: Third-party PDA) signer === anyone => [program, authority, seed ("idl")]
// -> create: signer === anyone
// -> update: signer === metadata.authority
// -> close: signer === metadata.authority
// -> set_authority: NOT ALLOWED

impl Header {
    pub const LEN: usize = core::mem::size_of::<Header>(); // 88 bytes

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
