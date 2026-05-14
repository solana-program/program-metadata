use pinocchio::{
    cpi::{Seed, Signer},
    error::ProgramError,
    sysvars::{rent::Rent, Sysvar},
    AccountView, ProgramResult,
};
use pinocchio_system::instructions::{Allocate, Assign};

use crate::{
    error::ProgramMetadataError,
    processor::derive_program_address,
    state::{buffer::Buffer, AccountDiscriminator, SEED_LEN},
    ID,
};

use super::is_program_authority;

/// Processor for the [`Allocate`](`crate::instruction::ProgramMetadataInstruction::Allocate`)
/// instruction.
pub fn allocate(accounts: &mut [AccountView], instruction_data: &[u8]) -> ProgramResult {
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

    let (is_pda, bump, canonical) = if buffer.address() == authority.address() {
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

        let canonical = is_program_authority(program, program_data, authority.address())?;

        let (derived_metadata, bump) = if canonical {
            derive_program_address(&[program.address().as_array(), instruction_data], &ID)
        } else {
            derive_program_address(
                &[
                    program.address().as_array(),
                    authority.address().as_array(),
                    instruction_data,
                ],
                &ID,
            )
        };

        if buffer.address() != &derived_metadata {
            return Err(ProgramError::InvalidSeeds);
        }

        (true, bump, canonical)
    };

    match buffer.data_len() {
        0 => {
            // Allocates the space for the buffer account and assigns it to
            // the program.

            let space = Buffer::LEN as u64;

            match (is_pda, canonical) {
                // canonical
                (true, true) => allocate_and_assign(
                    buffer,
                    space,
                    &[
                        Seed::from(program.address().as_array()),
                        Seed::from(instruction_data),
                        Seed::from(&[bump]),
                    ],
                )?,
                // non-canonical
                (true, false) => allocate_and_assign(
                    buffer,
                    space,
                    &[
                        Seed::from(program.address().as_array()),
                        Seed::from(authority.address().as_array()),
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
            if !buffer.owned_by(&crate::ID) {
                Assign {
                    account: buffer,
                    owner: &crate::ID,
                }
                .invoke()?;
            } else {
                // Checks whether the buffer account is already initialized or not.
                //
                // SAFETY: scoped borrow of the `buffer` account data.
                let data = unsafe { buffer.borrow_unchecked() };

                if data[0] != AccountDiscriminator::Empty as u8 {
                    return Err(ProgramError::AccountAlreadyInitialized);
                }
            }
        }
        _ => return Err(ProgramError::InvalidAccountData),
    }

    // `buffer` length is within the permitted limit.
    let minimum_balance = Rent::get()?.minimum_balance_unchecked(buffer.data_len());

    if buffer.lamports() < minimum_balance {
        return Err(ProgramError::AccountNotRentExempt);
    }

    // Writes the buffer header.

    // SAFETY: single mutable borrow of the `buffer` account data. The legth of the buffer account
    // data has been checked to be at least `Buffer::LEN` and uninitialized.
    let buffer_header = Buffer::from_bytes_mut(unsafe { buffer.borrow_unchecked_mut() })?;
    buffer_header.discriminator = AccountDiscriminator::Buffer as u8;
    buffer_header.authority = (*authority.address()).into();

    if is_pda {
        buffer_header.program = (*program.address()).into();
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
fn allocate_and_assign(account: &AccountView, space: u64, seeds: &[Seed]) -> ProgramResult {
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
