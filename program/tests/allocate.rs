mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_account::Account;
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_program_metadata::{
    error::ProgramMetadataError,
    state::{buffer::Buffer, SEED_LEN},
};

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
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
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
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
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
        (
            &allocate(&buffer_key, &buffer_key, None, None, None),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_allocate_with_empty_account() {
    // Pre-allocated empty buffer account.

    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    process_instruction(
        (
            &allocate(&buffer_key, &buffer_key, None, None, None),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_allocate_with_unsufficient_length() {
    // Pre-allocated buffer account but with wrong size.

    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_empty_account(5, PROGRAM_ID);

    process_instruction(
        (
            &allocate(&buffer_key, &buffer_key, None, None, None),
            &[Check::err(ProgramError::InvalidAccountData)],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
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
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
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
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
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
        (
            &allocate(&buffer_key, &buffer_key, None, None, None),
            &[
                Check::success(),
                // data lenght
                Check::account(&buffer_key).space(Buffer::LEN).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
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
        (
            &allocate(&buffer_key, &buffer_key, None, None, None),
            &[
                Check::success(),
                // account owner
                Check::account(&buffer_key).owner(&PROGRAM_ID).build(),
                // account discriminator
                Check::account(&buffer_key).data_slice(0, &[1]).build(),
            ],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
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
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[Check::err(ProgramError::AccountNotRentExempt)],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
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
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[Check::err(ProgramError::AccountNotRentExempt)],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_allocate_with_unfunded_account() {
    // Unfunded "keypair" buffer account.

    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_funded_account(0, system_program::ID);

    process_instruction(
        (
            &allocate(&buffer_key, &buffer_key, None, None, None),
            &[Check::err(ProgramError::AccountNotRentExempt)],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_allocate_keypair_with_seed() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    process_instruction(
        (
            &allocate(&buffer_key, &buffer_key, None, None, Some(&seed)),
            &[Check::err(ProgramError::InvalidInstructionData)],
        ),
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_allocate_pda_with_wrong_seed() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let mut wrong_seed = [0u8; SEED_LEN];
    wrong_seed[0..5].copy_from_slice("other".as_bytes());

    let (buffer_key, _) = Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    process_instruction(
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&wrong_seed),
            ),
            &[Check::err(ProgramError::InvalidSeeds)],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_allocate_pda_for_non_executable_program() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = Account::default();

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (buffer_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );
    let buffer_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    process_instruction(
        (
            &allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            ),
            &[Check::err(ProgramError::Custom(
                ProgramMetadataError::NotExecutableAccount as u32,
            ))],
        ),
        &[
            (buffer_key, buffer_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_allocate_already_initialized_buffer() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None),
                &[Check::success()],
            ),
            (
                &allocate(&buffer_key, &buffer_key, None, None, None),
                &[Check::err(ProgramError::AccountAlreadyInitialized)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}
