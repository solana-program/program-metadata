//! This code was AUTOGENERATED using the codama library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun codama to update it.
//!
//! <https://github.com/codama-idl/codama>
//!

use crate::generated::types::Compression;
use crate::generated::types::DataSource;
use crate::generated::types::Encoding;
use crate::generated::types::Format;
use crate::hooked::RemainderOptionBytes;
use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
#[derive(Debug)]
pub struct SetData {
    /// Metadata account.
    pub metadata: solana_program::pubkey::Pubkey,
    /// Authority account.
    pub authority: solana_program::pubkey::Pubkey,
    /// Buffer account to copy data from.
    pub buffer: Option<solana_program::pubkey::Pubkey>,
    /// Program account.
    pub program: Option<solana_program::pubkey::Pubkey>,
    /// Program data account.
    pub program_data: Option<solana_program::pubkey::Pubkey>,
}

impl SetData {
    pub fn instruction(
        &self,
        args: SetDataInstructionArgs,
    ) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(args, &[])
    }
    #[allow(clippy::arithmetic_side_effects)]
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        args: SetDataInstructionArgs,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(5 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.metadata,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.authority,
            true,
        ));
        if let Some(buffer) = self.buffer {
            accounts.push(solana_program::instruction::AccountMeta::new(buffer, false));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::PROGRAM_METADATA_ID,
                false,
            ));
        }
        if let Some(program) = self.program {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                program, false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::PROGRAM_METADATA_ID,
                false,
            ));
        }
        if let Some(program_data) = self.program_data {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                program_data,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::PROGRAM_METADATA_ID,
                false,
            ));
        }
        accounts.extend_from_slice(remaining_accounts);
        let mut data = borsh::to_vec(&SetDataInstructionData::new()).unwrap();
        let mut args = borsh::to_vec(&args).unwrap();
        data.append(&mut args);

        solana_program::instruction::Instruction {
            program_id: crate::PROGRAM_METADATA_ID,
            accounts,
            data,
        }
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SetDataInstructionData {
    discriminator: u8,
}

impl SetDataInstructionData {
    pub fn new() -> Self {
        Self { discriminator: 3 }
    }
}

impl Default for SetDataInstructionData {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SetDataInstructionArgs {
    pub encoding: Encoding,
    pub compression: Compression,
    pub format: Format,
    pub data_source: DataSource,
    pub data: RemainderOptionBytes,
}

/// Instruction builder for `SetData`.
///
/// ### Accounts:
///
///   0. `[writable]` metadata
///   1. `[signer]` authority
///   2. `[writable, optional]` buffer
///   3. `[optional]` program
///   4. `[optional]` program_data
#[derive(Clone, Debug, Default)]
pub struct SetDataBuilder {
    metadata: Option<solana_program::pubkey::Pubkey>,
    authority: Option<solana_program::pubkey::Pubkey>,
    buffer: Option<solana_program::pubkey::Pubkey>,
    program: Option<solana_program::pubkey::Pubkey>,
    program_data: Option<solana_program::pubkey::Pubkey>,
    encoding: Option<Encoding>,
    compression: Option<Compression>,
    format: Option<Format>,
    data_source: Option<DataSource>,
    data: Option<RemainderOptionBytes>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl SetDataBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    /// Metadata account.
    #[inline(always)]
    pub fn metadata(&mut self, metadata: solana_program::pubkey::Pubkey) -> &mut Self {
        self.metadata = Some(metadata);
        self
    }
    /// Authority account.
    #[inline(always)]
    pub fn authority(&mut self, authority: solana_program::pubkey::Pubkey) -> &mut Self {
        self.authority = Some(authority);
        self
    }
    /// `[optional account]`
    /// Buffer account to copy data from.
    #[inline(always)]
    pub fn buffer(&mut self, buffer: Option<solana_program::pubkey::Pubkey>) -> &mut Self {
        self.buffer = buffer;
        self
    }
    /// `[optional account]`
    /// Program account.
    #[inline(always)]
    pub fn program(&mut self, program: Option<solana_program::pubkey::Pubkey>) -> &mut Self {
        self.program = program;
        self
    }
    /// `[optional account]`
    /// Program data account.
    #[inline(always)]
    pub fn program_data(
        &mut self,
        program_data: Option<solana_program::pubkey::Pubkey>,
    ) -> &mut Self {
        self.program_data = program_data;
        self
    }
    #[inline(always)]
    pub fn encoding(&mut self, encoding: Encoding) -> &mut Self {
        self.encoding = Some(encoding);
        self
    }
    #[inline(always)]
    pub fn compression(&mut self, compression: Compression) -> &mut Self {
        self.compression = Some(compression);
        self
    }
    #[inline(always)]
    pub fn format(&mut self, format: Format) -> &mut Self {
        self.format = Some(format);
        self
    }
    #[inline(always)]
    pub fn data_source(&mut self, data_source: DataSource) -> &mut Self {
        self.data_source = Some(data_source);
        self
    }
    #[inline(always)]
    pub fn data(&mut self, data: RemainderOptionBytes) -> &mut Self {
        self.data = Some(data);
        self
    }
    /// Add an additional account to the instruction.
    #[inline(always)]
    pub fn add_remaining_account(
        &mut self,
        account: solana_program::instruction::AccountMeta,
    ) -> &mut Self {
        self.__remaining_accounts.push(account);
        self
    }
    /// Add additional accounts to the instruction.
    #[inline(always)]
    pub fn add_remaining_accounts(
        &mut self,
        accounts: &[solana_program::instruction::AccountMeta],
    ) -> &mut Self {
        self.__remaining_accounts.extend_from_slice(accounts);
        self
    }
    #[allow(clippy::clone_on_copy)]
    pub fn instruction(&self) -> solana_program::instruction::Instruction {
        let accounts = SetData {
            metadata: self.metadata.expect("metadata is not set"),
            authority: self.authority.expect("authority is not set"),
            buffer: self.buffer,
            program: self.program,
            program_data: self.program_data,
        };
        let args = SetDataInstructionArgs {
            encoding: self.encoding.clone().expect("encoding is not set"),
            compression: self.compression.clone().expect("compression is not set"),
            format: self.format.clone().expect("format is not set"),
            data_source: self.data_source.clone().expect("data_source is not set"),
            data: self.data.clone().expect("data is not set"),
        };

        accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
    }
}

/// `set_data` CPI accounts.
pub struct SetDataCpiAccounts<'a, 'b> {
    /// Metadata account.
    pub metadata: &'b solana_program::account_info::AccountInfo<'a>,
    /// Authority account.
    pub authority: &'b solana_program::account_info::AccountInfo<'a>,
    /// Buffer account to copy data from.
    pub buffer: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program account.
    pub program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program data account.
    pub program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
}

/// `set_data` CPI instruction.
pub struct SetDataCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,
    /// Metadata account.
    pub metadata: &'b solana_program::account_info::AccountInfo<'a>,
    /// Authority account.
    pub authority: &'b solana_program::account_info::AccountInfo<'a>,
    /// Buffer account to copy data from.
    pub buffer: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program account.
    pub program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program data account.
    pub program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// The arguments for the instruction.
    pub __args: SetDataInstructionArgs,
}

impl<'a, 'b> SetDataCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: SetDataCpiAccounts<'a, 'b>,
        args: SetDataInstructionArgs,
    ) -> Self {
        Self {
            __program: program,
            metadata: accounts.metadata,
            authority: accounts.authority,
            buffer: accounts.buffer,
            program: accounts.program,
            program_data: accounts.program_data,
            __args: args,
        }
    }
    #[inline(always)]
    pub fn invoke(&self) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed_with_remaining_accounts(&[], &[])
    }
    #[inline(always)]
    pub fn invoke_with_remaining_accounts(
        &self,
        remaining_accounts: &[(
            &'b solana_program::account_info::AccountInfo<'a>,
            bool,
            bool,
        )],
    ) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed_with_remaining_accounts(&[], remaining_accounts)
    }
    #[inline(always)]
    pub fn invoke_signed(
        &self,
        signers_seeds: &[&[&[u8]]],
    ) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed_with_remaining_accounts(signers_seeds, &[])
    }
    #[allow(clippy::arithmetic_side_effects)]
    #[allow(clippy::clone_on_copy)]
    #[allow(clippy::vec_init_then_push)]
    pub fn invoke_signed_with_remaining_accounts(
        &self,
        signers_seeds: &[&[&[u8]]],
        remaining_accounts: &[(
            &'b solana_program::account_info::AccountInfo<'a>,
            bool,
            bool,
        )],
    ) -> solana_program::entrypoint::ProgramResult {
        let mut accounts = Vec::with_capacity(5 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.metadata.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.authority.key,
            true,
        ));
        if let Some(buffer) = self.buffer {
            accounts.push(solana_program::instruction::AccountMeta::new(
                *buffer.key,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::PROGRAM_METADATA_ID,
                false,
            ));
        }
        if let Some(program) = self.program {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                *program.key,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::PROGRAM_METADATA_ID,
                false,
            ));
        }
        if let Some(program_data) = self.program_data {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                *program_data.key,
                false,
            ));
        } else {
            accounts.push(solana_program::instruction::AccountMeta::new_readonly(
                crate::PROGRAM_METADATA_ID,
                false,
            ));
        }
        remaining_accounts.iter().for_each(|remaining_account| {
            accounts.push(solana_program::instruction::AccountMeta {
                pubkey: *remaining_account.0.key,
                is_signer: remaining_account.1,
                is_writable: remaining_account.2,
            })
        });
        let mut data = borsh::to_vec(&SetDataInstructionData::new()).unwrap();
        let mut args = borsh::to_vec(&self.__args).unwrap();
        data.append(&mut args);

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::PROGRAM_METADATA_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(6 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.metadata.clone());
        account_infos.push(self.authority.clone());
        if let Some(buffer) = self.buffer {
            account_infos.push(buffer.clone());
        }
        if let Some(program) = self.program {
            account_infos.push(program.clone());
        }
        if let Some(program_data) = self.program_data {
            account_infos.push(program_data.clone());
        }
        remaining_accounts
            .iter()
            .for_each(|remaining_account| account_infos.push(remaining_account.0.clone()));

        if signers_seeds.is_empty() {
            solana_program::program::invoke(&instruction, &account_infos)
        } else {
            solana_program::program::invoke_signed(&instruction, &account_infos, signers_seeds)
        }
    }
}

/// Instruction builder for `SetData` via CPI.
///
/// ### Accounts:
///
///   0. `[writable]` metadata
///   1. `[signer]` authority
///   2. `[writable, optional]` buffer
///   3. `[optional]` program
///   4. `[optional]` program_data
#[derive(Clone, Debug)]
pub struct SetDataCpiBuilder<'a, 'b> {
    instruction: Box<SetDataCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> SetDataCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(SetDataCpiBuilderInstruction {
            __program: program,
            metadata: None,
            authority: None,
            buffer: None,
            program: None,
            program_data: None,
            encoding: None,
            compression: None,
            format: None,
            data_source: None,
            data: None,
            __remaining_accounts: Vec::new(),
        });
        Self { instruction }
    }
    /// Metadata account.
    #[inline(always)]
    pub fn metadata(
        &mut self,
        metadata: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.metadata = Some(metadata);
        self
    }
    /// Authority account.
    #[inline(always)]
    pub fn authority(
        &mut self,
        authority: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.authority = Some(authority);
        self
    }
    /// `[optional account]`
    /// Buffer account to copy data from.
    #[inline(always)]
    pub fn buffer(
        &mut self,
        buffer: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    ) -> &mut Self {
        self.instruction.buffer = buffer;
        self
    }
    /// `[optional account]`
    /// Program account.
    #[inline(always)]
    pub fn program(
        &mut self,
        program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    ) -> &mut Self {
        self.instruction.program = program;
        self
    }
    /// `[optional account]`
    /// Program data account.
    #[inline(always)]
    pub fn program_data(
        &mut self,
        program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    ) -> &mut Self {
        self.instruction.program_data = program_data;
        self
    }
    #[inline(always)]
    pub fn encoding(&mut self, encoding: Encoding) -> &mut Self {
        self.instruction.encoding = Some(encoding);
        self
    }
    #[inline(always)]
    pub fn compression(&mut self, compression: Compression) -> &mut Self {
        self.instruction.compression = Some(compression);
        self
    }
    #[inline(always)]
    pub fn format(&mut self, format: Format) -> &mut Self {
        self.instruction.format = Some(format);
        self
    }
    #[inline(always)]
    pub fn data_source(&mut self, data_source: DataSource) -> &mut Self {
        self.instruction.data_source = Some(data_source);
        self
    }
    #[inline(always)]
    pub fn data(&mut self, data: RemainderOptionBytes) -> &mut Self {
        self.instruction.data = Some(data);
        self
    }
    /// Add an additional account to the instruction.
    #[inline(always)]
    pub fn add_remaining_account(
        &mut self,
        account: &'b solana_program::account_info::AccountInfo<'a>,
        is_writable: bool,
        is_signer: bool,
    ) -> &mut Self {
        self.instruction
            .__remaining_accounts
            .push((account, is_writable, is_signer));
        self
    }
    /// Add additional accounts to the instruction.
    ///
    /// Each account is represented by a tuple of the `AccountInfo`, a `bool` indicating whether the account is writable or not,
    /// and a `bool` indicating whether the account is a signer or not.
    #[inline(always)]
    pub fn add_remaining_accounts(
        &mut self,
        accounts: &[(
            &'b solana_program::account_info::AccountInfo<'a>,
            bool,
            bool,
        )],
    ) -> &mut Self {
        self.instruction
            .__remaining_accounts
            .extend_from_slice(accounts);
        self
    }
    #[inline(always)]
    pub fn invoke(&self) -> solana_program::entrypoint::ProgramResult {
        self.invoke_signed(&[])
    }
    #[allow(clippy::clone_on_copy)]
    #[allow(clippy::vec_init_then_push)]
    pub fn invoke_signed(
        &self,
        signers_seeds: &[&[&[u8]]],
    ) -> solana_program::entrypoint::ProgramResult {
        let args = SetDataInstructionArgs {
            encoding: self
                .instruction
                .encoding
                .clone()
                .expect("encoding is not set"),
            compression: self
                .instruction
                .compression
                .clone()
                .expect("compression is not set"),
            format: self.instruction.format.clone().expect("format is not set"),
            data_source: self
                .instruction
                .data_source
                .clone()
                .expect("data_source is not set"),
            data: self.instruction.data.clone().expect("data is not set"),
        };
        let instruction = SetDataCpi {
            __program: self.instruction.__program,

            metadata: self.instruction.metadata.expect("metadata is not set"),

            authority: self.instruction.authority.expect("authority is not set"),

            buffer: self.instruction.buffer,

            program: self.instruction.program,

            program_data: self.instruction.program_data,
            __args: args,
        };
        instruction.invoke_signed_with_remaining_accounts(
            signers_seeds,
            &self.instruction.__remaining_accounts,
        )
    }
}

#[derive(Clone, Debug)]
struct SetDataCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    metadata: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    buffer: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    encoding: Option<Encoding>,
    compression: Option<Compression>,
    format: Option<Format>,
    data_source: Option<DataSource>,
    data: Option<RemainderOptionBytes>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
