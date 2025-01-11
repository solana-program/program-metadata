#![cfg(feature = "test-sbf")]

mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check, Mollusk};
use solana_sdk::{account::AccountSharedData, pubkey::Pubkey, system_program};
use spl_program_metadata::state::{buffer::Buffer, SEED_LEN};

#[test]
fn test_allocate_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (buffer_key, _) = Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_account = create_empty_account(Buffer::LEN, system_program::ID);

    let instruction = allocate(
        &buffer_key,
        &authority_key,
        Some(&program_key),
        Some(&program_data_key),
        Some(&seed),
    )
    .unwrap();

    let mollusk = Mollusk::new(&PROGRAM_ID, "spl_program_metadata");
    mollusk.process_and_validate_instruction_chain(
        &[instruction],
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_non_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&PROGRAM_ID));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (buffer_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );
    let buffer_account = create_empty_account(Buffer::LEN, system_program::ID);

    let instruction = allocate(
        &buffer_key,
        &authority_key,
        Some(&program_key),
        Some(&program_data_key),
        Some(&seed),
    )
    .unwrap();

    let mollusk = Mollusk::new(&PROGRAM_ID, "spl_program_metadata");
    mollusk.process_and_validate_instruction_chain(
        &[instruction],
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_keypair() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_empty_account(Buffer::LEN, system_program::ID);

    let instruction = allocate(&buffer_key, &buffer_key, None, None, None).unwrap();

    let mollusk = Mollusk::new(&PROGRAM_ID, "spl_program_metadata");
    mollusk.process_and_validate_instruction_chain(
        &[instruction],
        &[
            (buffer_key, buffer_account.clone()),
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}
