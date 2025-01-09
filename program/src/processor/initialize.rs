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
    state::{header::Header, AccountDiscriminator, Compression, DataSource, Encoding, Format},
    ID,
};

/// Initializes a metadata account.
pub fn initialize(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    let (args, remaining_data) = if instruction_data.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    } else {
        let (args, remaining_data) = instruction_data.split_at(Initialize::LEN);
        (unsafe { Initialize::load_unchecked(args) }, remaining_data)
    };

    let [metadata, buffer, authority, program, program_data, _system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Accounts validation.

    // buffer
    // - implicit program owned check since we are closing the account

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

    // authority
    // - must be a signer

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // program
    // - must be executable

    let program_account_data = unsafe { program.borrow_data_unchecked() };

    let program_data_key = match (program_account_data.first(), program.executable()) {
        // 2 - program
        (Some(2), true) => {
            // offset = 4 (discriminator)
            let program_data_key: Pubkey = program_account_data[4..]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?;
            program_data_key
        }
        _ => {
            // TODO: use custom error (invalid program state)
            return Err(ProgramError::InvalidAccountData);
        }
    };

    // program data
    // - must match the program account data

    if program_data_key != *program_data.key() {
        // TODO: use custom error (invalid program data account)
        return Err(ProgramError::InvalidAccountData);
    }

    let program_data_account_data = unsafe { program_data.borrow_data_unchecked() };

    let canonical = match (program_data_account_data.first(), program_data.executable()) {
        // 3 - program data
        (Some(3), false) => {
            // offset = 4 (discriminator) + 8 (slot) + 1 (option)
            let authority_key: Pubkey = program_data_account_data[13..]
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?;
            authority.key() == &authority_key
        }
        _ => {
            // TODO: use custom error (invalid program state)
            return Err(ProgramError::InvalidAccountData);
        }
    };

    // metadata
    // - implicit program owned check since we are writing to the account

    let seeds: &[&[u8]] = if canonical {
        &[program.key(), args.seed.as_ref()]
    } else {
        &[program.key(), authority.key(), args.seed.as_ref()]
    };

    let (derived_metadata, bump) = find_program_address(seeds, &ID);

    if metadata.key() != &derived_metadata {
        return Err(ProgramError::InvalidSeeds);
    }

    // Allocates the metadata account.

    if !metadata.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    if has_buffer {
        unsafe {
            let metadata_lamports = metadata.borrow_mut_lamports_unchecked();
            let buffer_lamports = buffer.borrow_mut_lamports_unchecked();
            // Move the buffer lamports to the metadata account.
            *metadata_lamports = *buffer_lamports;
            *buffer_lamports = 0;
        }
    }

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

    // Initialize metadata account.

    let metadata_account_data = unsafe { metadata.borrow_mut_data_unchecked() };

    let metadata_header = unsafe { Header::load_mut_unchecked(metadata_account_data) };
    metadata_header.discriminator = AccountDiscriminator::Metadata as u8;
    metadata_header.program = *program.key();
    if !canonical {
        metadata_header.authority = (*authority.key()).into();
    }
    metadata_header.mutable = true as u8;
    metadata_header.canonical = canonical as u8;
    metadata_header.seed.copy_from_slice(args.seed.as_ref());
    metadata_header.encoding = Encoding::try_from(args.encoding)? as u8;
    metadata_header.compression = Compression::try_from(args.compression)? as u8;
    metadata_header.format = Format::try_from(args.format)? as u8;
    metadata_header.data_source = DataSource::try_from(args.data_source)? as u8;

    unsafe {
        sol_memcpy(&mut metadata_account_data[Header::LEN..], data, data.len());
    }

    // Close the buffer account (if needed).
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
