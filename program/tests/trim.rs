mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_account::Account;
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use solana_sdk_ids::{system_program, sysvar::rent};
use spl_program_metadata::state::{buffer::Buffer, header::Header};

const EXCESS_LAMPORTS: usize = 90;

#[test]
fn test_trim_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; 16];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + 10 + EXCESS_LAMPORTS),
        system_program::ID,
    );

    let destination_key = Pubkey::new_unique();

    process_instructions(
        &[
            (
                &initialize(
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
                .unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&metadata_key).data_slice(0, &[2]).build(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &[1u8; 10])
                        .build(),
                    // metadata lamports
                    Check::account(&metadata_key)
                        .lamports(minimum_balance_for(Header::LEN + 10 + EXCESS_LAMPORTS))
                        .build(),
                ],
            ),
            (
                &trim(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    &destination_key,
                )
                .unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&metadata_key).data_slice(0, &[2]).build(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &[1u8; 10])
                        .build(),
                    // metadata lamports
                    Check::account(&metadata_key)
                        .lamports(minimum_balance_for(Header::LEN + 10))
                        .build(),
                    // destination lamports
                    Check::account(&destination_key)
                        .lamports(lamports_for(EXCESS_LAMPORTS))
                        .build(),
                ],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            (destination_key, Account::default()),
            keyed_account_for_system_program(),
            (solana_rent::sysvar::ID, rent_sysvar()),
        ],
    );
}

#[test]
fn test_trim_non_canonical() {
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
    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + 10 + EXCESS_LAMPORTS),
        system_program::ID,
    );

    let destination_key = Pubkey::new_unique();

    process_instructions(
        &[
            (
                &initialize(
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
                .unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&metadata_key).data_slice(0, &[2]).build(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &[1u8; 10])
                        .build(),
                    // metadata lamports
                    Check::account(&metadata_key)
                        .lamports(minimum_balance_for(Header::LEN + 10 + EXCESS_LAMPORTS))
                        .build(),
                ],
            ),
            (
                &trim(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    &destination_key,
                )
                .unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&metadata_key).data_slice(0, &[2]).build(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &[1u8; 10])
                        .build(),
                    // metadata lamports
                    Check::account(&metadata_key)
                        .lamports(minimum_balance_for(Header::LEN + 10))
                        .build(),
                    // destination lamports
                    Check::account(&destination_key)
                        .lamports(lamports_for(EXCESS_LAMPORTS))
                        .build(),
                ],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            (destination_key, Account::default()),
            keyed_account_for_system_program(),
            (solana_rent::sysvar::ID, rent_sysvar()),
        ],
    );
}

#[test]
fn test_trim_buffer() {
    // "keypair" buffer account
    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + EXCESS_LAMPORTS),
        system_program::ID,
    );

    let destination_key = Pubkey::new_unique();

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[
                    Check::success(),
                    // data lenght
                    Check::account(&buffer_key).space(Buffer::LEN).build(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                    // buffer lamports
                    Check::account(&buffer_key)
                        .lamports(minimum_balance_for(Buffer::LEN + EXCESS_LAMPORTS))
                        .build(),
                ],
            ),
            (
                &trim(&buffer_key, &buffer_key, None, None, &destination_key).unwrap(),
                &[
                    Check::success(),
                    // data lenght
                    Check::account(&buffer_key).space(Buffer::LEN).build(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                    // buffer lamports
                    Check::account(&buffer_key)
                        .lamports(minimum_balance_for(Buffer::LEN))
                        .build(),
                    // destination lamports
                    Check::account(&destination_key)
                        .lamports(lamports_for(EXCESS_LAMPORTS))
                        .build(),
                ],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (destination_key, Account::default()),
            keyed_account_for_system_program(),
            (solana_rent::sysvar::ID, rent_sysvar()),
        ],
    );
}

#[test]
fn fail_trim_non_rent_exempt_account() {
    let destination_key = Pubkey::new_unique();
    let destination_account = create_empty_account(Buffer::LEN, PROGRAM_ID);

    // A program-owned account non-rent exempt on purpose to try trigger
    // an underflow
    let fake_buffer_key = Pubkey::new_unique();
    let mut fake_buffer_account = Account {
        lamports: 0,
        owner: PROGRAM_ID,
        data: vec![1; Buffer::LEN], // buffer discriminator
        ..Default::default()
    };
    // Set the authority to a non-zero value to pass the authority validation.
    fake_buffer_account.data[33..65].copy_from_slice(fake_buffer_key.as_array());

    let destination_lamports = destination_account.lamports;

    process_instructions(
        &[(
            &trim(
                &fake_buffer_key,
                &fake_buffer_key,
                None,
                None,
                &destination_key,
            )
            .unwrap(),
            &[
                Check::err(ProgramError::AccountNotRentExempt),
                Check::account(&destination_key)
                    .lamports(destination_lamports)
                    .build(),
                Check::account(&fake_buffer_key).lamports(0).build(),
            ],
        )],
        &[
            (fake_buffer_key, fake_buffer_account),
            (PROGRAM_ID, Account::default()),
            (destination_key, destination_account),
            keyed_account_for_system_program(),
            (rent::ID, rent_sysvar()),
        ],
    );
}
