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
fn test_set_authority_metadata() {
    let authority_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let initial_data = [1u8; 5];
    let updated_data = [4u8; 8];
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
                ),
                &[Check::success()],
            ),
            (
                &set_authority(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&new_authority_key),
                ),
                &[Check::success()],
            ),
            (
                &set_data(
                    &metadata_key,
                    &new_authority_key,
                    None,
                    None,
                    None,
                    SetDataArgs {
                        encoding: 0,
                        compression: 0,
                        format: 0,
                        data_source: Some(0),
                    },
                    Some(&updated_data),
                ),
                &[
                    Check::success(),
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
            (new_authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_remove_metadata_authority() {
    let authority_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let initial_data = [1u8; 5];
    let updated_data = [8u8; 7];
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
                ),
                &[Check::success()],
            ),
            (
                &set_authority(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&new_authority_key),
                ),
                &[Check::success()],
            ),
            (
                &set_authority(&metadata_key, &new_authority_key, None, None, None),
                &[Check::success()],
            ),
            // Set data with the program upgrade authority after removing the
            // metadata authority to ensure the program upgrade authority can
            // still update the metadata.
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
                    Some(&updated_data),
                ),
                &[
                    Check::success(),
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
            (new_authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_set_authority_buffer() {
    let buffer_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();
    let data = [5u8; 8];

    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + data.len()),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                ],
            ),
            (
                &set_authority(
                    &buffer_key,
                    &buffer_key,
                    None,
                    None,
                    Some(&new_authority_key),
                ),
                &[Check::success()],
            ),
            (
                &write(&buffer_key, &new_authority_key, None, 0, &data),
                &[
                    Check::success(),
                    // buffer data
                    Check::account(&buffer_key)
                        .data_slice(Buffer::LEN, &data)
                        .build(),
                ],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (new_authority_key, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_authority_immutable_metadata() {
    let authority_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 5), system_program::ID);

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
                    Some(&[1u8; 5]),
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
                &set_authority(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&new_authority_key),
                ),
                &[Check::err(ProgramError::Custom(
                    ProgramMetadataError::ImmutableMetadataAccount as u32,
                ))],
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
fn test_set_authority_non_canonical_metadata() {
    let authority_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();

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
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 5), system_program::ID);

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
                    Some(&[1u8; 5]),
                ),
                &[Check::success()],
            ),
            (
                &set_authority(
                    &metadata_key,
                    &authority_key,
                    None,
                    None,
                    Some(&new_authority_key),
                ),
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

#[test]
fn fail_set_authority_with_wrong_authority() {
    let authority_key = Pubkey::new_unique();
    let wrong_authority_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 5), system_program::ID);

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
                    Some(&[1u8; 5]),
                ),
                &[Check::success()],
            ),
            (
                &set_authority(
                    &metadata_key,
                    &wrong_authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&new_authority_key),
                ),
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
fn fail_set_authority_remove_buffer_authority() {
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
                &set_authority(&buffer_key, &buffer_key, None, None, None),
                &[Check::err(ProgramError::InvalidArgument)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_set_authority_with_missing_new_authority_bytes() {
    let buffer_key = Pubkey::new_unique();
    let new_authority_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    let mut instruction = set_authority(
        &buffer_key,
        &buffer_key,
        None,
        None,
        Some(&new_authority_key),
    );
    instruction.data.truncate(2);

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None),
                &[Check::success()],
            ),
            (
                &instruction,
                &[Check::err(ProgramError::InvalidInstructionData)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}
