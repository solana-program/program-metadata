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
fn test_close_metadata() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let data = [1u8; 7];
    let metadata_lamports = minimum_balance_for(Header::LEN + data.len());
    let metadata_account = create_funded_account(metadata_lamports, system_program::ID);

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
                    Some(&data),
                ),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&metadata_key).data_slice(0, &[2]).build(),
                ],
            ),
            (
                &close(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    &destination_key,
                ),
                &[
                    Check::success(),
                    // metadata account
                    Check::account(&metadata_key).closed().build(),
                    // destination lamports
                    Check::account(&destination_key)
                        .lamports(metadata_lamports)
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
        ],
    );
}

#[test]
fn test_close_buffer() {
    let buffer_key = Pubkey::new_unique();
    let buffer_lamports = minimum_balance_for(Buffer::LEN);
    let buffer_account = create_funded_account(buffer_lamports, system_program::ID);

    let destination_key = Pubkey::new_unique();

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
                &close(&buffer_key, &buffer_key, None, None, &destination_key),
                &[
                    Check::success(),
                    // buffer account
                    Check::account(&buffer_key).closed().build(),
                    // destination lamports
                    Check::account(&destination_key)
                        .lamports(buffer_lamports)
                        .build(),
                ],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (destination_key, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_close_with_wrong_authority() {
    let buffer_key = Pubkey::new_unique();
    let wrong_authority_key = Pubkey::new_unique();
    let buffer_lamports = minimum_balance_for(Buffer::LEN);
    let buffer_account = create_funded_account(buffer_lamports, system_program::ID);

    let destination_key = Pubkey::new_unique();

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None),
                &[Check::success()],
            ),
            (
                &close(
                    &buffer_key,
                    &wrong_authority_key,
                    None,
                    None,
                    &destination_key,
                ),
                &[Check::err(ProgramError::IncorrectAuthority)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (wrong_authority_key, Account::default()),
            (destination_key, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_close_uninitialized_account() {
    let account_key = Pubkey::new_unique();
    let destination_key = Pubkey::new_unique();

    process_instruction(
        (
            &close(&account_key, &account_key, None, None, &destination_key),
            &[Check::err(ProgramError::UninitializedAccount)],
        ),
        &[
            (account_key, Account::default()),
            (PROGRAM_ID, Account::default()),
            (destination_key, Account::default()),
        ],
    );
}

#[test]
fn fail_close_account_with_empty_discriminator() {
    let account_key = Pubkey::new_unique();
    let account = create_empty_account(Buffer::LEN, PROGRAM_ID);
    let destination_key = Pubkey::new_unique();

    process_instruction(
        (
            &close(&account_key, &account_key, None, None, &destination_key),
            &[Check::err(ProgramError::InvalidAccountData)],
        ),
        &[
            (account_key, account),
            (PROGRAM_ID, Account::default()),
            (destination_key, Account::default()),
        ],
    );
}

#[test]
fn fail_close_immutable_metadata() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let data = [1u8; 7];
    let metadata_lamports = minimum_balance_for(Header::LEN + data.len());
    let metadata_account = create_funded_account(metadata_lamports, system_program::ID);

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
                &close(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    &destination_key,
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
            (destination_key, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}
