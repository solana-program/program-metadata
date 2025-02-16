#![cfg(feature = "test-sbf")]

mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_sdk::{
    account::AccountSharedData, program_error::ProgramError, pubkey::Pubkey, system_program,
};
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

    // "canonical" buffer keypair
    let (buffer_key, _) = Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    process_instruction(
        allocate(
            &buffer_key,
            &authority_key,
            Some(&program_key),
            Some(&program_data_key),
            Some(&seed),
        )
        .unwrap(),
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
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

    // "non-canonical" buffer PDA account
    let (buffer_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );
    let buffer_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    process_instruction(
        allocate(
            &buffer_key,
            &authority_key,
            Some(&program_key),
            Some(&program_data_key),
            Some(&seed),
        )
        .unwrap(),
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_keypair() {
    // "keypair" buffer account
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instruction(
        allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_with_empty_account() {
    // Pre-allocated empty buffer account.

    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    process_instruction(
        allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_with_unsufficient_length() {
    // Pre-allocated buffer account but with wrong size.

    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_empty_account(5, PROGRAM_ID);

    process_instruction(
        allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[Check::err(ProgramError::InvalidAccountData)],
    );
}

#[test]
fn test_allocate_with_funded_canonical_account() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    // "canonical" buffer keypair
    let (buffer_key, _) = Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instruction(
        allocate(
            &buffer_key,
            &authority_key,
            Some(&program_key),
            Some(&program_data_key),
            Some(&seed),
        )
        .unwrap(),
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_with_funded_non_canonical_account() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&PROGRAM_ID));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    // "non-canonical" buffer PDA account
    let (buffer_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instruction(
        allocate(
            &buffer_key,
            &authority_key,
            Some(&program_key),
            Some(&program_data_key),
            Some(&seed),
        )
        .unwrap(),
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_with_funded_keypair_account() {
    // "keypair" buffer account
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instruction(
        allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key).space(Buffer::LEN).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_with_allocated_keypair_account() {
    // "keypair" buffer account
    let buffer_key = Pubkey::new_unique();
    // 100 extra bytes
    let buffer_account = create_empty_account(Buffer::LEN + 100, system_program::ID);

    process_instruction(
        allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // account owner
            Check::account(&buffer_key).owner(&PROGRAM_ID).build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
        ],
    );
}

#[test]
fn test_allocate_with_unfunded_canonical_account() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    // "canonical" buffer keypair
    let (buffer_key, _) = Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_account = create_funded_account(0, system_program::ID);

    process_instruction(
        allocate(
            &buffer_key,
            &authority_key,
            Some(&program_key),
            Some(&program_data_key),
            Some(&seed),
        )
        .unwrap(),
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[Check::err(ProgramError::AccountNotRentExempt)],
    );
}

#[test]
fn test_allocate_with_unfunded_non_canonical_account() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&PROGRAM_ID));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    // "non-canonical" buffer PDA account
    let (buffer_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );
    let buffer_account = create_funded_account(0, system_program::ID);

    process_instruction(
        allocate(
            &buffer_key,
            &authority_key,
            Some(&program_key),
            Some(&program_data_key),
            Some(&seed),
        )
        .unwrap(),
        &[
            (buffer_key, buffer_account),
            (authority_key, AccountSharedData::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
        &[Check::err(ProgramError::AccountNotRentExempt)],
    );
}

#[test]
fn test_allocate_with_unfunded_account() {
    // Unfunded "keypair" buffer account.

    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_funded_account(0, system_program::ID);

    process_instruction(
        allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[Check::err(ProgramError::AccountNotRentExempt)],
    );
}
