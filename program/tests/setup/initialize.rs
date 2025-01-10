use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_program,
};

use super::PROGRAM_ID;

pub fn initialize(
    authority: &Pubkey,
    program: &Pubkey,
    program_data: &Pubkey,
    _buffer: Option<&Pubkey>,
    args: InitializeArgs,
    instruction_data: Option<&[u8]>,
) -> Result<Instruction, ProgramError> {
    let seeds: &[&[u8]] = if args.canonical {
        &[program.as_ref(), args.seed.as_ref()]
    } else {
        &[program.as_ref(), authority.as_ref(), args.seed.as_ref()]
    };
    let (metadata_key, _) = Pubkey::find_program_address(seeds, &PROGRAM_ID);

    let accounts = vec![
        AccountMeta::new(metadata_key, false),
        AccountMeta::new_readonly(PROGRAM_ID, false),
        AccountMeta::new_readonly(*authority, true),
        AccountMeta::new_readonly(*program, false),
        AccountMeta::new_readonly(*program_data, false),
        AccountMeta::new_readonly(system_program::ID, false),
    ];

    let mut data = vec![0u8; 21];
    data[0] = 1;
    data[1..17].copy_from_slice(args.seed.as_ref());
    data[17] = args.encoding;
    data[18] = args.compression;
    data[19] = args.format;
    data[20] = args.data_source;

    if let Some(instruction_data) = instruction_data {
        data.extend_from_slice(instruction_data);
    }

    Ok(Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    })
}

pub struct InitializeArgs {
    pub canonical: bool,
    pub seed: [u8; 16],
    pub encoding: u8,
    pub compression: u8,
    pub format: u8,
    pub data_source: u8,
}
