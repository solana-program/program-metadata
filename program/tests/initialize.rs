#![cfg(feature = "test-sbf")]

mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_sdk::{account::Account, pubkey::Pubkey, system_program};
use spl_program_metadata::state::header::Header;

#[test]
fn test_initialize_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; 16];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 10), system_program::ID);

    let instruction = initialize(
        &authority_key,
        &program_key,
        Some(&program_data_key),
        InitializeArgs {
            canonical: true,
            seed,
            encoding: 0,
            compression: 0,
            format: 0,
            data_source: 0,
        },
        Some(&[1u8; 10]),
    )
    .unwrap();

    process_instruction(
        (
            &instruction,
            &[
                Check::success(),
                // account discriminator
                Check::account(&metadata_key).data_slice(0, &[2]).build(),
                // metadata data
                Check::account(&metadata_key)
                    .data_slice(Header::LEN, &[1u8; 10])
                    .build(),
            ],
        ),
        &[
            (metadata_key, metadata_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_initialize_non_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; 16];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 10), system_program::ID);

    let instruction = initialize(
        &authority_key,
        &program_key,
        None,
        InitializeArgs {
            canonical: false,
            seed,
            encoding: 0,
            compression: 0,
            format: 0,
            data_source: 0,
        },
        Some(&[1u8; 10]),
    )
    .unwrap();

    process_instruction(
        (
            &instruction,
            &[
                Check::success(),
                // account discriminator
                Check::account(&metadata_key).data_slice(0, &[2]).build(),
                // metadata data
                Check::account(&metadata_key)
                    .data_slice(Header::LEN, &[1u8; 10])
                    .build(),
            ],
        ),
        &[
            (metadata_key, metadata_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}
