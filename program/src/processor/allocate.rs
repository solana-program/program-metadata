use pinocchio::{
    account_info::AccountInfo,
    instruction::{Seed, Signer},
    program_error::ProgramError,
    pubkey::find_program_address,
    ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign};

use crate::{
    error::ProgramMetadataError,
    state::{buffer::Buffer, AccountDiscriminator, SEED_LEN},
    ID,
};

use super::is_program_authority;

/// Processor for the [`Allocate`](`crate::instruction::ProgramMetadataInstruction::Allocate`)
/// instruction.
pub fn allocate(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Access accounts.

    let [buffer, authority, program, program_data, _system_program, _remaining @ ..] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.
    //
    // Note that program owned and writable checks are done implicitly by writing
    // to the account.

    // authority
    // - must be a signer

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // buffer
    // - if pda, must have the correct derivation + seed; otherwise must be
    //   a signer (match the authority)
    // - must be rent exempt (pre-funded account)

    let (is_pda, bump, canonical) = if buffer.key() == authority.key() {
        // A keypair buffer does not require a `seed` value.
        if !instruction_data.is_empty() {
            return Err(ProgramError::InvalidInstructionData);
        }

        (false, 0, false)
    } else {
        // A PDA buffer requires a `seed` value...
        if instruction_data.len() != SEED_LEN {
            return Err(ProgramError::InvalidInstructionData);
        }
        // ...and an executable program account.
        if !program.executable() {
            return Err(ProgramMetadataError::NotExecutableAccount.into());
        }

        let canonical = is_program_authority(program, program_data, authority.key())?;

        let seeds: &[&[u8]] = if canonical {
            &[program.key(), instruction_data]
        } else {
            &[program.key(), authority.key(), instruction_data]
        };

        let (derived_metadata, bump) = find_program_address(seeds, &ID);

        if buffer.key() != &derived_metadata {
            return Err(ProgramError::InvalidSeeds);
        }

        (true, bump, canonical)
    };

    match buffer.data_len() {
        0 => {
            // Allocates the space for the buffer account and assigns it to
            // the program.

            if buffer.lamports() == 0 {
                return Err(ProgramError::AccountNotRentExempt);
            }

            let space = Buffer::LEN as u64;

            match (is_pda, canonical) {
                // canonical
                (true, true) => allocate_and_assign(
                    buffer,
                    space,
                    &[
                        Seed::from(program.key()),
                        Seed::from(instruction_data),
                        Seed::from(&[bump]),
                    ],
                )?,
                // non-canonical
                (true, false) => allocate_and_assign(
                    buffer,
                    space,
                    &[
                        Seed::from(program.key()),
                        Seed::from(authority.key()),
                        Seed::from(instruction_data),
                        Seed::from(&[bump]),
                    ],
                )?,
                // keypair
                (false, _) => allocate_and_assign(buffer, space, &[])?,
            }
        }
        n if n >= Buffer::LEN => {
            // If the owner of the buffer account is not the program, assigns the
            // buffer account to the program (the runtime only allows assigning
            // zeroed accounts, so there is no need to check the contents of the
            // account).
            if buffer.owner() != &crate::ID {
                Assign {
                    account: buffer,
                    owner: &crate::ID,
                }
                .invoke()?;
            } else {
                // Checks whether the buffer account is already initialized or not.
                //
                // SAFETY: scoped borrow of the `buffer` account data.
                let data = unsafe { buffer.borrow_data_unchecked() };

                if data[0] != AccountDiscriminator::Empty as u8 {
                    return Err(ProgramError::AccountAlreadyInitialized);
                }
            }
        }
        _ => return Err(ProgramError::InvalidAccountData),
    }

    // Writes the buffer header.

    // SAFETY: single mutable borrow of the `buffer` account data. The legth of the buffer account
    // data has been checked to be at least `Buffer::LEN` and uninitialized.
    let buffer_header =
        unsafe { Buffer::from_bytes_mut_unchecked(buffer.borrow_mut_data_unchecked()) };
    buffer_header.discriminator = AccountDiscriminator::Buffer as u8;
    buffer_header.authority = (*authority.key()).into();

    if is_pda {
        buffer_header.program = (*program.key()).into();
        buffer_header.canonical = canonical as u8;
        buffer_header
            .seed
            .copy_from_slice(instruction_data.as_ref());
    }

    Ok(())
}

/// Allocates the space for the account and assigns it to the program.
///
/// When the `account` is a PDA, the `seeds` are used to create the signer.
#[inline(always)]
fn allocate_and_assign(account: &AccountInfo, space: u64, seeds: &[Seed]) -> ProgramResult {
    let signer: &[Signer] = if seeds.is_empty() {
        &[]
    } else {
        &[Signer::from(seeds)]
    };

    Allocate { account, space }.invoke_signed(signer)?;

    Assign {
        account,
        owner: &crate::ID,
    }
    .invoke_signed(signer)
}
