mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_account::Account;
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
use spl_program_metadata::state::buffer::Buffer;

#[test]
fn test_write_instruction_data() {
    let buffer_key = Pubkey::new_unique();
    let data = [1u8; 10];
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + data.len()),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                    // data length
                    Check::account(&buffer_key).space(Buffer::LEN).build(),
                ],
            ),
            (
                &write(&buffer_key, &buffer_key, None, 0, &data).unwrap(),
                &[
                    Check::success(),
                    // data length
                    Check::account(&buffer_key)
                        .space(Buffer::LEN + data.len())
                        .build(),
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
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_write_from_buffer() {
    let source_key = Pubkey::new_unique();
    let target_key = Pubkey::new_unique();
    let data = [2u8; 12];

    let source_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + data.len()),
        system_program::ID,
    );
    let target_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + data.len()),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(&source_key, &source_key, None, None, None).unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&source_key).data_slice(0, &[1]).build(),
                ],
            ),
            (
                &write(&source_key, &source_key, None, 0, &data).unwrap(),
                &[
                    Check::success(),
                    // source buffer data
                    Check::account(&source_key)
                        .data_slice(Buffer::LEN, &data)
                        .build(),
                ],
            ),
            (
                &allocate(&target_key, &target_key, None, None, None).unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&target_key).data_slice(0, &[1]).build(),
                ],
            ),
            (
                &write(&target_key, &target_key, Some(&source_key), 0, &[]).unwrap(),
                &[
                    Check::success(),
                    // target buffer data
                    Check::account(&target_key)
                        .data_slice(Buffer::LEN, &data)
                        .build(),
                ],
            ),
        ],
        &[
            (source_key, source_account),
            (target_key, target_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn test_write_with_non_zero_offset_and_overwrite() {
    let buffer_key = Pubkey::new_unique();
    let initial_data: [u8; 3] = [9, 8, 7];
    let updated_data: [u8; 2] = [1, 2];
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN + 8), system_program::ID);

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &write(&buffer_key, &buffer_key, None, 5, &initial_data).unwrap(),
                &[
                    Check::success(),
                    Check::account(&buffer_key)
                        .data_slice(Buffer::LEN, &[0, 0, 0, 0, 0, 9, 8, 7])
                        .build(),
                ],
            ),
            (
                &write(&buffer_key, &buffer_key, None, 6, &updated_data).unwrap(),
                &[
                    Check::success(),
                    Check::account(&buffer_key)
                        .data_slice(Buffer::LEN, &[0, 0, 0, 0, 0, 9, 1, 2])
                        .build(),
                ],
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
fn fail_write_with_wrong_authority() {
    let buffer_key = Pubkey::new_unique();
    let wrong_authority_key = Pubkey::new_unique();
    let data = [9u8; 4];
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + data.len()),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &write(&buffer_key, &wrong_authority_key, None, 0, &data).unwrap(),
                &[Check::err(ProgramError::IncorrectAuthority)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            (wrong_authority_key, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_write_from_wrong_owner_source_buffer() {
    // A source buffer owned by a different program should not be
    // allowed to write to the target buffer.
    let source_key = Pubkey::new_unique();

    let target_key = Pubkey::new_unique();
    let target_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instructions(
        &[
            (
                &allocate(&target_key, &target_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &write(&target_key, &target_key, Some(&source_key), 0, &[]).unwrap(),
                &[Check::err(ProgramError::InvalidAccountOwner)],
            ),
        ],
        &[
            (source_key, Account::default()),
            (target_key, target_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}

#[test]
fn fail_write_empty_data_without_source_buffer() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &write(&buffer_key, &buffer_key, None, 0, &[]).unwrap(),
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

#[test]
fn fail_write_from_same_buffer() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &write(&buffer_key, &buffer_key, Some(&buffer_key), 0, &[]).unwrap(),
                &[Check::err(ProgramError::InvalidAccountData)],
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
fn fail_write_without_rent_for_growth() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account =
        create_funded_account(minimum_balance_for(Buffer::LEN), system_program::ID);

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &write(&buffer_key, &buffer_key, None, 0, &[1]).unwrap(),
                &[Check::err(ProgramError::AccountNotRentExempt)],
            ),
        ],
        &[
            (buffer_key, buffer_account),
            (PROGRAM_ID, Account::default()),
            keyed_account_for_system_program(),
        ],
    );
}
