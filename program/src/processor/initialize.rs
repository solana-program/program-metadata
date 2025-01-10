use pinocchio::{
    account_info::AccountInfo,
    instruction::{Seed, Signer},
    memory::sol_memcpy,
    program_error::ProgramError,
    pubkey::find_program_address,
    ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign};

use crate::{
    state::{header::Header, AccountDiscriminator, Compression, DataSource, Encoding, Format},
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
///
pub fn initialize(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let (args, remaining_data) = if instruction_data.len() < Initialize::LEN {
        return Err(ProgramError::InvalidInstructionData);
    } else {
        let (args, remaining_data) = instruction_data.split_at(Initialize::LEN);
        (unsafe { Initialize::load_unchecked(args) }, remaining_data)
    };

    // Access accounts.
    let [metadata, buffer, authority, program, program_data, _system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Get data from buffer or remaining instruction data.
    let (data, has_buffer) = {
        let has_buffer = buffer.key() != &ID;
        let has_remaining_data = !remaining_data.is_empty();
        let data = match (has_remaining_data, has_buffer) {
            (true, false) => remaining_data,
            (false, true) => {
                let buffer_data = unsafe { buffer.borrow_data_unchecked() };
                if buffer_data.is_empty() || buffer_data[0] != AccountDiscriminator::Buffer as u8 {
                    return Err(ProgramError::InvalidAccountData);
                }
                &buffer_data[Header::LEN..]
            }
            _ => return Err(ProgramError::InvalidInstructionData),
        };
        (data, has_buffer)
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

    // Ensure metadata account is not already initialized.
    if !metadata.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    // Use the buffer account to fund the metadata account, if provided.
    if has_buffer {
        unsafe {
            let metadata_lamports = metadata.borrow_mut_lamports_unchecked();
            let buffer_lamports = buffer.borrow_mut_lamports_unchecked();
            // Move the buffer lamports to the metadata account.
            *metadata_lamports += *buffer_lamports;
            *buffer_lamports = 0;
        }
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
        space: (Header::LEN + data.len()) as u64,
    }
    .invoke_signed(signer)?;
    Assign {
        account: metadata,
        owner: &crate::ID,
    }
    .invoke_signed(signer)?;

    // Initialize the metadata account.
    let metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };
    let header = unsafe { Header::load_mut_unchecked(metadata_account_data) };
    header.discriminator = AccountDiscriminator::Metadata as u8;
    header.program = *program.key();
    if !canonical {
        header.authority = (*authority.key()).into();
    }
    header.mutable = true as u8;
    header.canonical = canonical as u8;
    header.seed.copy_from_slice(args.seed.as_ref());
    header.encoding = Encoding::try_from(args.encoding)? as u8;
    header.compression = Compression::try_from(args.compression)? as u8;
    header.format = Format::try_from(args.format)? as u8;
    header.data_source = DataSource::try_from(args.data_source)? as u8;
    unsafe {
        sol_memcpy(&mut metadata_account_data[Header::LEN..], data, data.len());
    }

    // Close the buffer account, if provided.
    if has_buffer {
        buffer.close()?;
    }

    Ok(())
}

struct Initialize {
    pub seed: [u8; 17],
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
