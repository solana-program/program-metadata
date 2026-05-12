mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_account::Account;
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_program_metadata::{
    error::ProgramMetadataError,
    state::{buffer::Buffer, header::Header, SEED_LEN},
};

#[test]
fn test_set_data_instruction_data() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let initial_data = [1u8; 5];
    let updated_data = [2u8; 12];
    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + updated_data.len()),
        system_program::ID,
    );

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
                    Some(&initial_data),
                )
                .unwrap(),
                &[
                    Check::success(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &initial_data)
                        .build(),
                ],
            ),
            (
                &set_data(
                    &metadata_key,
                    &authority_key,
                    None,
                    Some(&program_key),
                    Some(&program_data_key),
                    SetDataArgs {
                        encoding: 1,
                        compression: 0,
                        format: 1,
                        data_source: Some(0),
                    },
                    Some(&updated_data),
                )
                .unwrap(),
                &[
                    Check::success(),
                    // data length
                    Check::account(&metadata_key)
                        .space(Header::LEN + updated_data.len())
                        .build(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &updated_data)
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
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_set_data_buffer() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let buffer_key = Pubkey::new_unique();
    let initial_data = [1u8; 5];
    let updated_data = [3u8; 9];

    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + updated_data.len()),
        system_program::ID,
    );
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + updated_data.len()),
        system_program::ID,
    );

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
                    Some(&initial_data),
                )
                .unwrap(),
                &[
                    Check::success(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &initial_data)
                        .build(),
                ],
            ),
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                ],
            ),
            (
                &write(&buffer_key, &buffer_key, None, 0, &updated_data).unwrap(),
                &[
                    Check::success(),
                    // buffer data
                    Check::account(&buffer_key)
                        .data_slice(Buffer::LEN, &updated_data)
                        .build(),
                ],
            ),
            (
                &set_data(
                    &metadata_key,
                    &authority_key,
                    Some(&buffer_key),
                    Some(&program_key),
                    Some(&program_data_key),
                    SetDataArgs {
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    None,
                )
                .unwrap(),
                &[
                    Check::success(),
                    // data length
                    Check::account(&metadata_key)
                        .space(Header::LEN + updated_data.len())
                        .build(),
                    // metadata data
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &updated_data)
                        .build(),
                ],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_data_with_wrong_authority() {
    let authority_key = Pubkey::new_unique();
    let wrong_authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let data = [1u8; 5];
    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + data.len()),
        system_program::ID,
    );

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
                    Some(&data),
                )
                .unwrap(),
                &[Check::success()],
            ),
            (
                &set_data(
                    &metadata_key,
                    &wrong_authority_key,
                    None,
                    Some(&program_key),
                    Some(&program_data_key),
                    SetDataArgs {
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    Some(&[2u8; 5]),
                )
                .unwrap(),
                &[Check::err(ProgramError::IncorrectAuthority)],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (wrong_authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_data_from_empty_buffer_as_direct_data() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_key = Pubkey::new_unique();
    let data = [1u8; 5];

    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + data.len()),
        system_program::ID,
    );
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

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
                    Some(&data),
                )
                .unwrap(),
                &[Check::success()],
            ),
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &set_data(
                    &metadata_key,
                    &authority_key,
                    Some(&buffer_key),
                    Some(&program_key),
                    Some(&program_data_key),
                    SetDataArgs {
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    None,
                )
                .unwrap(),
                &[Check::err(ProgramError::Custom(
                    ProgramMetadataError::InvalidDataLength as u32,
                ))],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_data_from_wrong_owner_buffer() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let buffer_key = Pubkey::new_unique();
    let data = [1u8; 5];

    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + data.len()),
        system_program::ID,
    );
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

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
                    Some(&data),
                )
                .unwrap(),
                &[Check::success()],
            ),
            (
                &set_data(
                    &metadata_key,
                    &authority_key,
                    Some(&buffer_key),
                    Some(&program_key),
                    Some(&program_data_key),
                    SetDataArgs {
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    None,
                )
                .unwrap(),
                &[Check::err(ProgramError::InvalidAccountOwner)],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_data_with_invalid_encoding() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let data = [1u8; 5];
    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + data.len()),
        system_program::ID,
    );

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
                    Some(&data),
                )
                .unwrap(),
                &[Check::success()],
            ),
            (
                &set_data(
                    &metadata_key,
                    &authority_key,
                    None,
                    Some(&program_key),
                    Some(&program_data_key),
                    SetDataArgs {
                        encoding: 99,
                        compression: 0,
                        format: 0,
                        data_source: None,
                    },
                    None,
                )
                .unwrap(),
                &[Check::err(ProgramError::InvalidAccountData)],
            ),
        ],
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
