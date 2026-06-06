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
fn test_set_immutable_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let data = [1u8; 6];
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
                ),
                &[Check::success()],
            ),
            (
                &set_immutable(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                ),
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
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    Some(&[2u8; 6]),
                ),
                &[Check::err(ProgramError::Custom(
                    ProgramMetadataError::ImmutableMetadataAccount as u32,
                ))],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_set_immutable_non_canonical() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) = Pubkey::find_program_address(
        &[program_key.as_ref(), authority_key.as_ref(), &seed],
        &PROGRAM_ID,
    );

    let data = [1u8; 6];
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
                    None,
                    InitializeArgs {
                        canonical: false,
                        seed,
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: 0,
                    },
                    Some(&data),
                ),
                &[Check::success()],
            ),
            (
                &set_immutable(&metadata_key, &authority_key, None, None),
                &[Check::success()],
            ),
            (
                &set_data(
                    &metadata_key,
                    &authority_key,
                    None,
                    None,
                    None,
                    SetDataArgs {
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    Some(&[2u8; 6]),
                ),
                &[Check::err(ProgramError::Custom(
                    ProgramMetadataError::ImmutableMetadataAccount as u32,
                ))],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_immutable_with_wrong_authority() {
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

    let data = [1u8; 6];
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
                ),
                &[Check::success()],
            ),
            (
                &set_immutable(
                    &metadata_key,
                    &wrong_authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                ),
                &[Check::err(ProgramError::IncorrectAuthority)],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (authority_key, Account::default()),
            (wrong_authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_immutable_buffer_account() {
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
                &set_immutable(&buffer_key, &buffer_key, None, None),
                &[Check::err(ProgramError::UninitializedAccount)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_immutable_twice() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let data = [1u8; 6];
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
                ),
                &[Check::success()],
            ),
            (
                &set_immutable(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                ),
                &[Check::success()],
            ),
            (
                &set_immutable(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                ),
                &[Check::err(ProgramError::Custom(
                    ProgramMetadataError::ImmutableMetadataAccount as u32,
                ))],
            ),
        ],
        &[
            (metadata_key, metadata_account),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}
