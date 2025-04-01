use pinocchio::{
    account_info::{AccountInfo, Ref},
    program_error::ProgramError,
    pubkey::Pubkey,
};

use super::{
    Account, AccountDiscriminator, Compression, DataSource, Encoding, Format, ZeroableOption,
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

    /// Extra padding for alignment.
    ///
    /// This allows the data section to start at a 8-byte boundary.
    _padding: [u8; 5],
}

impl Header {
    /// Length of the header (96 bytes).
    pub const LEN: usize = core::mem::size_of::<Header>();

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

    /// Returns a `Header` from a metadata account info.
    ///
    /// This method will perform the following validations on the account info:
    ///  1. Owner check: it must match the `ProgramMetadata` program.
    ///  2. Account discriminator: it must match [`AccountDiscriminator::Metadata`].
    ///  3. Borrow data: it must be allowed to borrow the account data.
    #[inline]
    pub fn from_account_info(account_info: &AccountInfo) -> Result<Ref<Self>, ProgramError> {
        if !account_info.is_owned_by(&crate::ID) {
            return Err(ProgramError::InvalidAccountOwner);
        }
        let data = account_info.try_borrow_data()?;
        if data.len() < Self::LEN || data[0] != AccountDiscriminator::Metadata as u8 {
            return Err(ProgramError::InvalidAccountData);
        }
        // SAFETY: `data` was validated to have the correct owner and discriminator.
        Ok(Ref::map(data, |data| unsafe {
            Self::from_bytes_unchecked(data)
        }))
    }

    /// Returns a `Header` from a metadata account info.
    ///
    /// This method will perform the following validations on the account info:
    ///  1. Owner check: it must match the `ProgramMetadata` program.
    ///  2. Account discriminator: it must match [`AccountDiscriminator::Metadata`].
    ///
    /// # Safety
    ///
    /// The caller must ensure that it is safe to borrow the account data, e.g., there are
    /// no mutable borrows of the account data.
    #[inline]
    pub unsafe fn from_account_info_unchecked(
        account_info: &AccountInfo,
    ) -> Result<&Self, ProgramError> {
        if account_info.owner() != &crate::ID {
            return Err(ProgramError::InvalidAccountOwner);
        }
        let data = account_info.borrow_data_unchecked();
        if data.len() < Self::LEN || data[0] != AccountDiscriminator::Metadata as u8 {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self::from_bytes_unchecked(data))
    }

    /// Return a `Header` from the given bytes.
    ///
    /// This method validates that `bytes` has at least the minimum required
    /// length.
    #[inline(always)]
    pub fn from_bytes(bytes: &[u8]) -> Result<&Self, ProgramError> {
        if bytes.len() < Self::LEN {
            return Err(ProgramError::InvalidArgument);
        }
        // SAFETY: `bytes` was validated to have the expected length
        // to hold a `Header` reference.
        Ok(unsafe { Self::from_bytes_unchecked(bytes) })
    }

    /// Return a `Header` from the given bytes.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `bytes` contains a valid representation of `Header`.
    #[inline(always)]
    pub unsafe fn from_bytes_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }

    /// Return a mutable `Header` from the given bytes.
    ///
    /// This method validates that `bytes` has at least the minimum required
    /// length.
    #[inline(always)]
    pub fn from_bytes_mut(bytes: &mut [u8]) -> Result<&mut Self, ProgramError> {
        if bytes.len() < Self::LEN {
            return Err(ProgramError::InvalidArgument);
        }
        // SAFETY: `bytes` was validated to have the expected length
        // to hold a `Header` reference.
        Ok(unsafe { Self::from_bytes_mut_unchecked(bytes) })
    }

    /// Return a mutable `Header` from the given bytes.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `bytes` contains a valid representation of `Header`.
    #[inline(always)]
    pub(crate) unsafe fn from_bytes_mut_unchecked(bytes: &mut [u8]) -> &mut Self {
        &mut *(bytes.as_mut_ptr() as *mut Self)
    }
}

impl Account for Header {
    fn get_authority(&self) -> Option<&Pubkey> {
        self.authority.as_ref()
    }

    fn is_canonical(&self, program: &Pubkey) -> bool {
        self.canonical() && self.program == *program
    }
}
