mod setup;
pub use setup::*;

use mollusk_svm::{program::keyed_account_for_system_program, result::Check};
use solana_account::Account;
use solana_program_error::ProgramError;
use solana_pubkey::Pubkey;
use solana_sdk_ids::system_program;
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
            (
                &allocate(
                    &buffer_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&seed),
                )
                .unwrap(),
                &[
                    Check::success(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                    // data lenght
                    Check::account(&buffer_key).space(Buffer::LEN).build(),
                ],
            ),
            (
                &extend(
                    &buffer_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    EXTEND_LENGTH as u16,
                )
                .unwrap(),
                &[
                    Check::success(),
                    // data lenght
                    Check::account(&buffer_key)
                        .space(Buffer::LEN + EXTEND_LENGTH)
                        .build(),
                    // lamports
                    Check::account(&buffer_key)
                        .lamports(minimum_balance_for(Buffer::LEN + EXTEND_LENGTH))
                        .build(),
                ],
            ),
        ],
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
fn test_extend_non_canonical() {
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
            (
                &allocate(
                    &buffer_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    Some(&seed),
                )
                .unwrap(),
                &[
                    Check::success(),
                    // data lenght
                    Check::account(&buffer_key).space(Buffer::LEN).build(),
                    // account discriminator
                    Check::account(&buffer_key).data_slice(0, &[1]).build(),
                ],
            ),
            (
                &extend(
                    &buffer_key,
                    &authority_key,
                    Some(&program_key),
                    Some(&program_data_key),
                    EXTEND_LENGTH as u16,
                )
                .unwrap(),
                &[
                    Check::success(),
                    // data lenght
                    Check::account(&buffer_key)
                        .space(Buffer::LEN + EXTEND_LENGTH)
                        .build(),
                    // lamports
                    Check::account(&buffer_key)
                        .lamports(minimum_balance_for(Buffer::LEN + EXTEND_LENGTH))
                        .build(),
                ],
            ),
        ],
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
fn test_extend_buffer() {
    let buffer_key = Pubkey::new_unique();
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + EXTEND_LENGTH),
        system_program::ID,
    );

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
                ],
            ),
            (
                &extend(&buffer_key, &buffer_key, None, None, EXTEND_LENGTH as u16).unwrap(),
                &[
                    Check::success(),
                    // data lenght
                    Check::account(&buffer_key)
                        .space(Buffer::LEN + EXTEND_LENGTH)
                        .build(),
                    // lamports
                    Check::account(&buffer_key)
                        .lamports(minimum_balance_for(Buffer::LEN + EXTEND_LENGTH))
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
fn fail_extend_with_wrong_authority() {
    let buffer_key = Pubkey::new_unique();
    let wrong_authority_key = Pubkey::new_unique();
    let buffer_account = create_funded_account(
        minimum_balance_for(Buffer::LEN + EXTEND_LENGTH),
        system_program::ID,
    );

    process_instructions(
        &[
            (
                &allocate(&buffer_key, &buffer_key, None, None, None).unwrap(),
                &[Check::success()],
            ),
            (
                &extend(
                    &buffer_key,
                    &wrong_authority_key,
                    None,
                    None,
                    EXTEND_LENGTH as u16,
                )
                .unwrap(),
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
fn fail_extend_without_rent_for_growth() {
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
                &extend(&buffer_key, &buffer_key, None, None, 1).unwrap(),
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

#[test]
fn fail_extend_uninitialized_account() {
    let account_key = Pubkey::new_unique();

    process_instruction(
        (
            &extend(&account_key, &account_key, None, None, EXTEND_LENGTH as u16).unwrap(),
            &[Check::err(ProgramError::InvalidAccountData)],
        ),
        &[
            (account_key, Account::default()),
            (PROGRAM_ID, Account::default()),
        ],
    );
}

#[test]
fn fail_extend_with_invalid_instruction_data() {
    let buffer_key = Pubkey::new_unique();
    let mut instruction =
        extend(&buffer_key, &buffer_key, None, None, EXTEND_LENGTH as u16).unwrap();
    instruction.data.truncate(1);

    process_instruction(
        (
            &instruction,
            &[Check::err(ProgramError::InvalidInstructionData)],
        ),
        &[
            (buffer_key, Account::default()),
            (PROGRAM_ID, Account::default()),
        ],
    );
}
