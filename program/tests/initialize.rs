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
    );

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
    );

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
fn test_initialize_from_buffer() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let data = [7u8; 12];
    let metadata_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + data.len()),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&seed),
                ),
                &[
                    Check::success(),
                    Check::account(&metadata_key).data_slice(0, &[1]).build(),
                ],
            ),
            (
                &write(&metadata_key, &authority_key, None, 0, &data),
                &[
                    Check::success(),
                    Check::account(&metadata_key)
                        .data_slice(Buffer::LEN, &data)
                        .build(),
                ],
            ),
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
                    None,
                ),
                &[
                    Check::success(),
                    Check::account(&metadata_key).data_slice(0, &[2]).build(),
                    Check::account(&metadata_key)
                        .data_slice(Header::LEN, &data)
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
fn fail_initialize_already_initialized_metadata() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let data = [1u8; 10];
    let metadata_account = create_funded_account(
        minimum_balance_for(Header::LEN + data.len()),
        system_program::ID,
    );

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
        Some(&data),
    );

    process_instructions(
        &[
            (&instruction, &[Check::success()]),
            // second attempt should fail since the metadata account is already initialized
            (
                &instruction,
                &[Check::err(ProgramError::AccountAlreadyInitialized)],
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
fn fail_initialize_from_buffer_with_instruction_data() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);

    let buffer_data = [7u8; 12];
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + buffer_data.len()),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(
                    &metadata_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&seed),
                ),
                &[Check::success()],
            ),
            (
                &write(&metadata_key, &authority_key, None, 0, &buffer_data),
                &[Check::success()],
            ),
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
                    Some(&[8u8; 4]), // instruction data
                ),
                &[Check::err(ProgramError::InvalidInstructionData)],
            ),
        ],
        &[
            (metadata_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_initialize_with_wrong_metadata_pda() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let wrong_metadata_key = Pubkey::new_unique();
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 10), system_program::ID);

    let mut instruction = initialize(
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
    );
    instruction.accounts[0].pubkey = wrong_metadata_key;

    process_instruction(
        (&instruction, &[Check::err(ProgramError::InvalidSeeds)]),
        &[
            (wrong_metadata_key, metadata_account),
            (PROGRAM_ID, Account::default()),
            (authority_key, Account::default()),
            (program_key, program_account),
            (program_data_key, program_data_account),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_initialize_without_rent_exemption() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account = create_funded_account(0, system_program::ID);

    process_instruction(
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
            ),
            &[Check::err(ProgramError::AccountNotRentExempt)],
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
fn fail_initialize_without_data() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN), system_program::ID);

    process_instruction(
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
                None,
            ),
            &[Check::err(ProgramError::InvalidInstructionData)],
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
fn fail_initialize_with_invalid_encoding() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 10), system_program::ID);

    process_instruction(
        (
            &initialize(
                &authority_key,
                &program_key,
                Some(&program_data_key),
                InitializeArgs {
                    canonical: true,
                    seed,
                    encoding: 99,
                    compression: 0,
                    format: 0,
                    data_source: 0,
                },
                Some(&[1u8; 10]),
            ),
            &[Check::err(ProgramError::InvalidAccountData)],
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
fn fail_initialize_external_data_with_wrong_length() {
    let authority_key = Pubkey::new_unique();

    let program_data_key = Pubkey::new_unique();
    let program_data_account = setup_program_data_account(Some(&authority_key));

    let program_key = Pubkey::new_unique();
    let program_account = setup_program_account(&program_data_key);

    let mut seed = [0u8; SEED_LEN];
    seed[0..3].copy_from_slice("idl".as_bytes());

    let (metadata_key, _) =
        Pubkey::find_program_address(&[program_key.as_ref(), &seed], &PROGRAM_ID);
    let metadata_account =
        create_funded_account(minimum_balance_for(Header::LEN + 10), system_program::ID);

    process_instruction(
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
                    data_source: 2,
                },
                Some(&[1u8; 10]),
            ),
            &[Check::err(ProgramError::Custom(
                ProgramMetadataError::InvalidDataLength as u32,
            ))],
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
