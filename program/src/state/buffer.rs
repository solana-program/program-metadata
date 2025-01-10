use pinocchio::{program_error::ProgramError, pubkey::Pubkey};

use super::{AccountDiscriminator, ZeroableOption};

/// Buffer account header.
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
    pub seed: [u8; 16],

    // Extra padding for alignment.
    _padding: [u8; 14],
}

impl Buffer {
    pub const LEN: usize = core::mem::size_of::<Buffer>(); // 96 bytes

    pub fn discriminator(&self) -> Result<AccountDiscriminator, ProgramError> {
        self.discriminator.try_into()
    }

    pub fn canonical(&self) -> bool {
        self.canonical != 0
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
