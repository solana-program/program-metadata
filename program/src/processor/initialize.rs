use pinocchio::{
    account_info::AccountInfo,
    instruction::{Seed, Signer},
    memory::sol_memcpy,
    program_error::ProgramError,
    pubkey::{find_program_address, Pubkey},
    seeds, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign};

use crate::{
    state::{
        header::Header, AccountDiscriminator, Compression, DataSource, Encoding, Format, Zeroable,
    },
    ID,
};

use super::is_program_authority;

/// Processor for the [`Initialize`](`crate::instruction::ProgramMetadataInstruction::Initialize`)
/// instruction.
pub fn initialize(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    let (args, remaining_data) = if instruction_data.len() < Initialize::LEN {
        return Err(ProgramError::InvalidInstructionData);
    } else {
        let (args, remaining_data) = instruction_data.split_at(Initialize::LEN);
        // SAFETY: `instruction_data` length is checked above.
        (unsafe { Initialize::load_unchecked(args) }, remaining_data)
    };

    // Access accounts.

    let [metadata, authority, program, program_data, _system_program, _remaining @ ..] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.
    //
    // Note that program owned and writable checks are done implicitly by writing
    // to the account.

    // authority
    // - must be a signer
    // - must either be the program upgrade authority (for canonical metadata accounts)
    //   OR be included in the seeds used to derive the metadata account address (for
    //   non-canonical metadata accounts)

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let canonical: bool = is_program_authority(program, program_data, authority.key())?;

    // metadata
    // - must be a PDA derived from the program ID and the seed
    // - must not already be initialized — i.e. it must either be empty, in which case
    //   the remaining instruction data is used as the metadata account data; OR be a
    //   pre-allocated buffer (i.e. `discriminator = 1`), in which case, no remaining
    //   instruction data is allowed as the data must already be written to the account

    let seeds: &[&[u8]] = if canonical {
        &[program.key(), args.seed.as_ref()]
    } else {
        &[program.key(), authority.key(), args.seed.as_ref()]
    };

    let (derived_metadata, bump) = find_program_address(seeds, &ID);

    if metadata.key() != &derived_metadata {
        return Err(ProgramError::InvalidSeeds);
    }

    let discriminator = {
        // SAFETY: scoped immutable borrow of `metadata` account data.
        AccountDiscriminator::from_bytes(unsafe { metadata.borrow_data_unchecked() })?
    };

    let data_length = match discriminator {
        Some(AccountDiscriminator::Empty) => {
            // An account with an `Empty` discriminator means some "zero" account was
            // provided. However, the initialize instruction only supports accounts with
            // no data or pre-allocated buffer (meaning the account should have use the
            // `allocate` and `write` instructions first).
            return Err(ProgramError::InvalidAccountData);
        }
        Some(AccountDiscriminator::Buffer) => {
            // When using a pre-allocated buffer, no remaining instruction data
            // is allowed.
            if !remaining_data.is_empty() {
                return Err(ProgramError::InvalidAccountData);
            }
            metadata.data_len() - Header::LEN
        }
        Some(AccountDiscriminator::Metadata) => {
            return Err(ProgramError::AccountAlreadyInitialized)
        }
        None => {
            if metadata.lamports() == 0 {
                return Err(ProgramError::AccountNotRentExempt);
            }
            // Ensure remaining data is provided.
            if remaining_data.is_empty() {
                return Err(ProgramError::InvalidInstructionData);
            }

            // Allocate and assign the metadata account.
            let signer_bump = &[bump];
            let signer_seeds: &[Seed] = if canonical {
                // canonical
                &seeds!(program.key(), args.seed.as_ref(), signer_bump)
            } else {
                // non-canonical
                &seeds!(
                    program.key(),
                    authority.key(),
                    args.seed.as_ref(),
                    signer_bump
                )
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

            // SAFETY: scoped mutable borrow of `metadata` account data. The data is
            // guaranteed to be allocated and assigned to the program.
            let metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };

            // Copy the instruction remaining data to the metadata account.
            //
            // SAFETY: `metadata` account has been allocated and assigned to the program
            // and the length of the remaining data was checked.
            unsafe {
                sol_memcpy(
                    metadata_account_data.get_unchecked_mut(Header::LEN..),
                    remaining_data,
                    remaining_data.len(),
                );
            }

            remaining_data.len()
        }
    };

    // Initialize the metadata account.

    // SAFETY: there are no other active borrows to `metadata` account data and
    // the account discriminator has been validated.
    let header = unsafe { Header::from_bytes_mut_unchecked(metadata.borrow_mut_data_unchecked()) };

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

/// The instruction data for the `Initialize` instruction.
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
    #[inline(always)]
    pub(crate) unsafe fn load_unchecked(bytes: &[u8]) -> &Self {
        &*(bytes.as_ptr() as *const Self)
    }
}
