mod allocate;
mod extend;
mod initialize;
mod trim;
mod write;

pub use allocate::*;
pub use extend::*;
pub use initialize::*;
pub use trim::*;
pub use write::*;

use mollusk_svm::{result::Check, Mollusk};
use solana_account::{create_account_for_test, Account};
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;
use solana_rent::Rent;
use solana_sdk_ids::bpf_loader_upgradeable;

pub const PROGRAM_ID: Pubkey = Pubkey::new_from_array(spl_program_metadata::ID);

pub fn create_account(data: Vec<u8>, executable: bool, owner: Pubkey) -> Account {
    let space = data.len();
    let lamports = Rent::default().minimum_balance(space);

    Account {
        lamports,
        data,
        executable,
        owner,
        ..Default::default()
    }
}

pub fn create_empty_account(size: usize, owner: Pubkey) -> Account {
    let lamports = Rent::default().minimum_balance(size);
    Account {
        lamports,
        owner,
        data: vec![0; size],
        ..Default::default()
    }
}

pub fn create_funded_account(lamports: u64, owner: Pubkey) -> Account {
    Account {
        lamports,
        owner,
        ..Default::default()
    }
}

pub fn lamports_for(bytes: usize) -> u64 {
    Rent::default().minimum_balance(bytes) - Rent::default().minimum_balance(0)
}

pub fn minimum_balance_for(data_len: usize) -> u64 {
    Rent::default().minimum_balance(data_len)
}

pub fn process_instruction(instruction: (&Instruction, &[Check]), accounts: &[(Pubkey, Account)]) {
    process_instructions(&[instruction], accounts);
}

pub fn process_instructions(
    instructions: &[(&Instruction, &[Check])],
    accounts: &[(Pubkey, Account)],
) {
    let mollusk = Mollusk::new(&PROGRAM_ID, "spl_program_metadata");
    mollusk.process_and_validate_instruction_chain(instructions, accounts);
}

pub fn rent_sysvar() -> Account {
    create_account_for_test(&Rent::default())
}

pub fn setup_program_account(program_data: &Pubkey) -> Account {
    let mut data = vec![0; 36];
    data[0] = 2;
    data[4..36].copy_from_slice(program_data.as_ref());

    create_account(data, true, bpf_loader_upgradeable::ID)
}

pub fn setup_program_data_account(authority: Option<&Pubkey>) -> Account {
    let mut data = vec![0; 45];
    data[0] = 3;

    if let Some(authority) = authority {
        data[12] = 1;
        data[13..45].copy_from_slice(authority.as_ref());
    }

    create_account(data, false, bpf_loader_upgradeable::ID)
}
