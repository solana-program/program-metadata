use pinocchio::{
    account_info::{AccountInfo, Ref},
    program_error::ProgramError,
    pubkey::Pubkey,
};

use super::{Account, AccountDiscriminator, ZeroableOption, SEED_LEN};

/// Buffer account header.
///
/// A buffer holds a variable amount of data after its header information.
#[repr(C)]
pub struct Buffer {
    /// Account discriminator.
    pub(crate) discriminator: u8,

    /// Program ID that this metadata is associated with.
    ///
    /// Only for buffer PDA accounts; otherwise `None`.
    pub program: ZeroableOption<Pubkey>,

    /// Authority that can update this buffer.
    ///
    /// Only for buffer PDA accounts; otherwise `None`.
    pub authority: ZeroableOption<Pubkey>,

    /// Indicates whether the buffer PDA is canonical.
    ///
    /// Only for buffer PDA accounts; otherwise `0`.
    pub(crate) canonical: u8,

    /// Seed used to derive the PDA.
    ///
    /// Only for buffer PDA accounts; otherwise `[0u8; 16]`.
    pub seed: [u8; SEED_LEN],

    /// Extra padding for alignment.
    ///
    /// This makes the `Buffer` header section to be the same size as
    /// the metadata [`Header`](`super::Header`).
    _padding: [u8; 14],
}

impl Buffer {
    /// The minimum size of a `Buffer` (`96` bytes).
    pub const LEN: usize = core::mem::size_of::<Buffer>();

    #[inline(always)]
    pub fn discriminator(&self) -> Result<AccountDiscriminator, ProgramError> {
        self.discriminator.try_into()
    }

    #[inline(always)]
    pub fn canonical(&self) -> bool {
        self.canonical != 0
    }

    /// Returns a `Buffer` from its account info.
    ///
    /// This method will perform the following validations on the account info:
    ///  1. Owner check: it must match the `ProgramMetadata` program.
    ///  2. Account discriminator: it must match [`AccountDiscriminator::Buffer`].
    ///  3. Borrow data: it must be allowed to borrow the account data.
    #[inline]
    pub fn from_account_info(account_info: &AccountInfo) -> Result<Ref<Self>, ProgramError> {
        if !account_info.is_owned_by(&crate::ID) {
            return Err(ProgramError::InvalidAccountOwner);
        }
        let data = account_info.try_borrow_data()?;
        if data.len() < Self::LEN || data[0] != AccountDiscriminator::Buffer as u8 {
            return Err(ProgramError::InvalidAccountData);
        }
        // SAFETY: `data` was validated to have the correct owner and discriminator.
        Ok(Ref::map(data, |data| unsafe {
            Self::from_bytes_unchecked(data)
        }))
    }

    /// Returns a `Buffer` from its account info.
    ///
    /// This method will perform the following validations on the account info:
    ///  1. Owner check: it must match the `ProgramMetadata` program.
    ///  2. Account discriminator: it must match [`AccountDiscriminator::Buffer`].
    ///
    /// # Safety
    ///
    /// The caller must ensure that it is safe to borrow the account data – e.g., there are
    /// no mutable borrows of the account data.
    #[inline]
    pub unsafe fn from_account_info_unchecked(
        account_info: &AccountInfo,
    ) -> Result<&Self, ProgramError> {
        if account_info.owner() != &crate::ID {
            return Err(ProgramError::InvalidAccountOwner);
        }
        let data = account_info.borrow_data_unchecked();
        if data.len() < Self::LEN || data[0] != AccountDiscriminator::Buffer as u8 {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(Self::from_bytes_unchecked(data))
    }

    /// Return a `Buffer` from the given bytes.
    ///
    /// This method validates that `bytes` has at least the minimum required
    /// length.
    #[inline(always)]
    pub fn from_bytes(bytes: &[u8]) -> Result<&Self, ProgramError> {
        if bytes.len() < Self::LEN {
            return Err(ProgramError::InvalidArgument);
        }
        // SAFETY: `bytes` was validated to have the expected length
        // to hold a `Buffer` reference.
        Ok(unsafe { Self::from_bytes_unchecked(bytes) })
    }

    /// Return a `Buffer` from the given bytes.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `bytes` contains a valid representation of `Buffer`.
    #[inline(always)]
    pub unsafe fn from_bytes_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }

    /// Return a mutable `Buffer` from the given bytes.
    ///
    /// This method validates that `bytes` has at least the minimum required
    /// length.
    #[inline(always)]
    pub fn from_bytes_mut(bytes: &mut [u8]) -> Result<&mut Self, ProgramError> {
        if bytes.len() < Self::LEN {
            return Err(ProgramError::InvalidArgument);
        }
        // SAFETY: `bytes` was validated to have the expected length
        // to hold a `Buffer` reference.
        Ok(unsafe { Self::from_bytes_mut_unchecked(bytes) })
    }

    /// Return a mutable `Buffer` from the given bytes.
    ///
    /// # Safety
    ///
    /// The caller must ensure that `bytes` contains a valid representation of `Buffer`.
    #[inline(always)]
    pub(crate) unsafe fn from_bytes_mut_unchecked(bytes: &mut [u8]) -> &mut Self {
        &mut *(bytes.as_mut_ptr() as *mut Self)
    }
}

impl Account for Buffer {
    fn get_authority(&self) -> Option<&Pubkey> {
        self.authority.as_ref()
    }

    fn is_canonical(&self, program: &Pubkey) -> bool {
        self.canonical() && self.program.as_ref() == Some(program)
    }
}
