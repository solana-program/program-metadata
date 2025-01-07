use crate::instruction::CounterInstruction;
use borsh::BorshDeserialize;
use create::create;
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, msg, pubkey::Pubkey};

pub mod create;

pub fn process_instruction<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction: CounterInstruction = CounterInstruction::try_from_slice(instruction_data)?;
    match instruction {
        CounterInstruction::Create => {
            msg!("Instruction: Create");
            create(accounts)
        }
    }
}
