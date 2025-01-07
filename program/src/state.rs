use borsh::{BorshDeserialize, BorshSerialize};
use shank::ShankAccount;
use solana_program::account_info::AccountInfo;
use solana_program::entrypoint::ProgramResult;
use solana_program::msg;
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

use crate::error::CounterError;

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

#[repr(C)]
#[derive(Clone, BorshSerialize, BorshDeserialize, Debug, ShankAccount)]
pub struct Metadata {
    pub discriminator: AccountDiscriminator,
    pub program: Pubkey,
    pub authority: Option<Pubkey>, // ZeroableOption.
    mutable: u8,                   // get => is_mutable: bool
    canonical: u8,                 // get => is_canonical: bool
    pub seed: [u8; 17],            // 16 + 1
    pub encoding: Encoding,
    pub compression: Compression,
    pub format: Format,
    pub data_source: DataSource,
    // Trailing data.
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

impl Metadata {
    pub const HEADER: usize = 1 + 32 + 32 + 19 + 1 + 1 + 1 + 1; // 88 bytes

    pub fn seeds<'a>(program: &'a Pubkey, seed: &'a [u8; 16]) -> Vec<&'a [u8]> {
        vec![program.as_ref(), seed.as_ref()]
    }

    pub fn find_pda<'a>(program: &'a Pubkey, seed: &'a [u8; 16]) -> (Pubkey, u8) {
        Pubkey::find_program_address(&Self::seeds(program, seed), &crate::ID)
    }

    pub fn load(account: &AccountInfo) -> Result<Self, ProgramError> {
        let mut bytes: &[u8] = &(*account.data).borrow();
        Metadata::deserialize(&mut bytes).map_err(|error| {
            msg!("Error: {}", error);
            CounterError::DeserializationError.into()
        })
    }

    pub fn save(&self, account: &AccountInfo) -> ProgramResult {
        borsh::to_writer(&mut account.data.borrow_mut()[..], self).map_err(|error| {
            msg!("Error: {}", error);
            CounterError::SerializationError.into()
        })
    }
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Debug)]
pub enum AccountDiscriminator {
    Buffer,
    Metadata,
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Debug)]
pub enum Encoding {
    None,
    Utf8,
    Base58,
    Base64,
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Debug)]
pub enum Compression {
    None,
    Gzip,
    Zstd,
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Debug)]
pub enum Format {
    None,
    Json,
    Yaml,
    Toml,
}

#[derive(Clone, BorshSerialize, BorshDeserialize, Debug)]
pub enum DataSource {
    Direct,
    Url,
    External,
}

#[derive(Debug)]
pub struct DirectData<'a>(pub &'a [u8]);

#[derive(BorshSerialize, Debug)]
pub struct UrlData<'a>(pub &'a str);

#[derive(Clone, BorshSerialize, BorshDeserialize, Debug)]
pub struct ExternalData {
    pub address: Pubkey,
    pub offset: u32,         // Default to 0.
    pub length: Option<u32>, // ZeroableOption. 0 means the whole account.
}
