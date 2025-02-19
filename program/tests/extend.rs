#![cfg(feature = "test-sbf")]

mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_sdk::{account::AccountSharedData, pubkey::Pubkey, system_program};
use spl_program_metadata::state::{buffer::Buffer, SEED_LEN};

const EXTEND_LENGTH: usize = 200;

#[test]
fn test_extend_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    // "canonical" buffer keypair
    let (buffer_key, _) = Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + EXTEND_LENGTH),
        system_program::ID,
    );

    process_instructions(
        &[
            allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            )
            .unwrap(),
            extend(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                EXTEND_LENGTH as u16,
            )
            .unwrap(),
        ],
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
            Check::account(&buffer_key)
                .space(Buffer::LEN + EXTEND_LENGTH)
                .build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
            // lamports
            Check::account(&buffer_key)
                .lamports(minimum_balance_for(Buffer::LEN + EXTEND_LENGTH))
                .build(),
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
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + EXTEND_LENGTH),
        system_program::ID,
    );

    process_instructions(
        &[
            allocate(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                Some(&seed),
            )
            .unwrap(),
            extend(
                &buffer_key,
                &authority_key,
                Some(&program_key),
                Some(&program_data_key),
                EXTEND_LENGTH as u16,
            )
            .unwrap(),
        ],
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
            Check::account(&buffer_key)
                .space(Buffer::LEN + EXTEND_LENGTH)
                .build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
            // lamports
            Check::account(&buffer_key)
                .lamports(minimum_balance_for(Buffer::LEN + EXTEND_LENGTH))
                .build(),
        ],
    );
}

#[test]
fn test_extend_buffer() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + EXTEND_LENGTH),
        system_program::ID,
    );

    process_instructions(
        &[
            allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
            extend(&buffer_key, &buffer_key, None, None, EXTEND_LENGTH as u16).unwrap(),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, AccountSharedData::default()),
            keyed_account_for_system_program(),
        ],
        &[
            Check::success(),
            // data lenght
            Check::account(&buffer_key)
                .space(Buffer::LEN + EXTEND_LENGTH)
                .build(),
            // account discriminator
            Check::account(&buffer_key).data_slice(0, &[1]).build(),
            // lamports
            Check::account(&buffer_key)
                .lamports(minimum_balance_for(Buffer::LEN + EXTEND_LENGTH))
                .build(),
        ],
    );
}
