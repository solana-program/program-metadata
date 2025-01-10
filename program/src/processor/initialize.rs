use pinocchio::{
    account_info::AccountInfo,
    instruction::{Seed, Signer},
    memory::sol_memcpy,
    program_error::ProgramError,
    pubkey::{find_program_address, Pubkey},
    ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign};

use crate::{
    state::{
        header::Header, AccountDiscriminator, Compression, DataSource, Encoding, Format, Zeroable,
    },
    ID,
};

use super::is_program_authority;

/// Initializes a metadata account.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [explicit] The instruction data must be at least `Initialize::LEN` bytes long.
/// - [explicit] Either some extra instruction data or a `buffer` account must be provided but not both.
/// - [explicit] The exact number of accounts must be provided.
/// - [explicit] The `buffer` account, if provided, must have a discriminator set to `1` — i.e. defining a `Buffer` account.
/// - [implicit] The `buffer` account must be owned by the program. Implicitly checked by closing the account.
/// - [explicit] The `authority` account must be a signer.
/// - [explicit] The `authority` account must either:
///   - be the program upgrade authority (for canonical metadata accounts) OR
///   - be included in the seeds used to derive the metadata account address (for non-canonical metadata accounts).
/// - [explicit] The `program` and `program_data` accounts must pass the `is_program_authority` checks.
/// - [explicit] The `metadata` account must be empty.
/// - [implicit] The `metadata` account must be owned by the Program Metadata program. Implicitly checked by writing to the account.
/// - [implicit] The `metadata` account must be pre-funded when passing extra instruction data. Implicitly checked by writing to the account.
pub fn initialize(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let (args, remaining_data) = if instruction_data.len() < Initialize::LEN {
        return Err(ProgramError::InvalidInstructionData);
    } else {
        let (args, remaining_data) = instruction_data.split_at(Initialize::LEN);
        (unsafe { Initialize::load_unchecked(args) }, remaining_data)
    };

    // Access accounts.
    let [metadata, authority, program, program_data, _system_program, _remaining @ ..] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate authority.
    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let canonical = is_program_authority(program, program_data, authority.key())?;

    // Validatate metadata seeds.
    let seeds: &[&[u8]] = if canonical {
        &[program.key(), args.seed.as_ref()]
    } else {
        &[program.key(), authority.key(), args.seed.as_ref()]
    };
    let (derived_metadata, bump) = find_program_address(seeds, &ID);
    if metadata.key() != &derived_metadata {
        return Err(ProgramError::InvalidSeeds);
    }

    let mut metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };
    let discriminator = if metadata_account_data.is_empty() {
        None
    } else {
        Some(AccountDiscriminator::try_from(metadata_account_data[0])?)
    };

    let data_length = match discriminator {
        Some(AccountDiscriminator::Buffer) => {
            // When using a pre-allocated buffer, no remaining instruction data
            // is allowed.
            if !remaining_data.is_empty() {
                return Err(ProgramError::InvalidAccountData);
            }
            metadata_account_data.len() - Header::LEN
        }
        Some(AccountDiscriminator::Metadata) => {
            return Err(ProgramError::AccountAlreadyInitialized)
        }
        None => {
            // Ensure remaining data is provided.
            if remaining_data.is_empty() {
                return Err(ProgramError::InvalidInstructionData);
            }

            // Allocate and assign the metadata account.
            let signer_bump = &[bump];
            let signer_seeds: &[Seed] = if canonical {
                &[
                    Seed::from(program.key()),
                    Seed::from(args.seed.as_ref()),
                    Seed::from(signer_bump),
                ]
            } else {
                &[
                    Seed::from(program.key()),
                    Seed::from(authority.key()),
                    Seed::from(args.seed.as_ref()),
                    Seed::from(signer_bump),
                ]
            };
            let signer = &[Signer::from(signer_seeds)];

            Allocate {
                account: metadata,
                space: (Header::LEN + remaining_data.len()) as u64,
            }
            .invoke_signed(signer)?;
            Assign {
                account: metadata,
                owner: &crate::ID,
            }
            .invoke_signed(signer)?;

            // Refresh the metadata account data reference.
            metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };

            // Copy the instruction remaining data to the metadata account.
            unsafe {
                sol_memcpy(
                    &mut metadata_account_data[Header::LEN..],
                    remaining_data,
                    remaining_data.len(),
                );
            }

            remaining_data.len()
        }
        _ => {
            return Err(ProgramError::InvalidAccountData);
        }
    };

    // Initialize the metadata account.
    let header = unsafe { Header::load_mut_unchecked(metadata_account_data) };
    header.discriminator = AccountDiscriminator::Metadata as u8;
    header.program = *program.key();
    header.authority = match canonical {
        true => Pubkey::ZERO.into(),
        false => (*authority.key()).into(),
    };
    header.mutable = true as u8;
    header.canonical = canonical as u8;
    header.seed.copy_from_slice(args.seed.as_ref());
    header.encoding = Encoding::try_from(args.encoding)? as u8;
    header.compression = Compression::try_from(args.compression)? as u8;
    header.format = Format::try_from(args.format)? as u8;
    header.data_source = {
        let data_source = DataSource::try_from(args.data_source)?;
        data_source.validate_data_length(data_length)?;
        data_source as u8
    };
    header.data_length = (data_length as u32).to_le_bytes();

    Ok(())
}

struct Initialize {
    pub seed: [u8; 16],
    pub encoding: u8,
    pub compression: u8,
    pub format: u8,
    pub data_source: u8,
}

impl Initialize {
    const LEN: usize = core::mem::size_of::<Self>();

    /// # Safety
    ///
    /// The `bytes` length is validated on the processor.
    pub(crate) unsafe fn load_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }
}
