//! This code was AUTOGENERATED using the codama library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun codama to update it.
//!
//! <https://github.com/codama-idl/codama>
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;

/// Accounts.
#[derive(Debug)]
pub struct Extend {
    /// Buffer or metadata account.
    pub account: solana_program::pubkey::Pubkey,
    /// Authority account.
    pub authority: solana_program::pubkey::Pubkey,
    /// Program account.
    pub program: Option<solana_program::pubkey::Pubkey>,
    /// Program data account.
    pub program_data: Option<solana_program::pubkey::Pubkey>,
}

impl Extend {
    pub fn instruction(
        &self,
        args: ExtendInstructionArgs,
    ) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(args, &[])
    }
    #[allow(clippy::arithmetic_side_effects)]
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        args: ExtendInstructionArgs,
        remaining_accounts: &[solana_program::instruction::AccountMeta],
    ) -> solana_program::instruction::Instruction {
        let mut accounts = Vec::with_capacity(4 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new(
            self.account,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.authority,
            true,
        ));
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
        let mut data = borsh::to_vec(&ExtendInstructionData::new()).unwrap();
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
pub struct ExtendInstructionData {
    discriminator: u8,
}

impl ExtendInstructionData {
    pub fn new() -> Self {
        Self { discriminator: 8 }
    }
}

impl Default for ExtendInstructionData {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ExtendInstructionArgs {
    pub length: u16,
}

/// Instruction builder for `Extend`.
///
/// ### Accounts:
///
///   0. `[writable]` account
///   1. `[signer]` authority
///   2. `[optional]` program
///   3. `[optional]` program_data
#[derive(Clone, Debug, Default)]
pub struct ExtendBuilder {
    account: Option<solana_program::pubkey::Pubkey>,
    authority: Option<solana_program::pubkey::Pubkey>,
    program: Option<solana_program::pubkey::Pubkey>,
    program_data: Option<solana_program::pubkey::Pubkey>,
    length: Option<u16>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl ExtendBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    /// Buffer or metadata account.
    #[inline(always)]
    pub fn account(&mut self, account: solana_program::pubkey::Pubkey) -> &mut Self {
        self.account = Some(account);
        self
    }
    /// Authority account.
    #[inline(always)]
    pub fn authority(&mut self, authority: solana_program::pubkey::Pubkey) -> &mut Self {
        self.authority = Some(authority);
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
    pub fn length(&mut self, length: u16) -> &mut Self {
        self.length = Some(length);
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
        let accounts = Extend {
            account: self.account.expect("account is not set"),
            authority: self.authority.expect("authority is not set"),
            program: self.program,
            program_data: self.program_data,
        };
        let args = ExtendInstructionArgs {
            length: self.length.clone().expect("length is not set"),
        };

        accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
    }
}

/// `extend` CPI accounts.
pub struct ExtendCpiAccounts<'a, 'b> {
    /// Buffer or metadata account.
    pub account: &'b solana_program::account_info::AccountInfo<'a>,
    /// Authority account.
    pub authority: &'b solana_program::account_info::AccountInfo<'a>,
    /// Program account.
    pub program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program data account.
    pub program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
}

/// `extend` CPI instruction.
pub struct ExtendCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,
    /// Buffer or metadata account.
    pub account: &'b solana_program::account_info::AccountInfo<'a>,
    /// Authority account.
    pub authority: &'b solana_program::account_info::AccountInfo<'a>,
    /// Program account.
    pub program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program data account.
    pub program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// The arguments for the instruction.
    pub __args: ExtendInstructionArgs,
}

impl<'a, 'b> ExtendCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: ExtendCpiAccounts<'a, 'b>,
        args: ExtendInstructionArgs,
    ) -> Self {
        Self {
            __program: program,
            account: accounts.account,
            authority: accounts.authority,
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
        let mut accounts = Vec::with_capacity(4 + remaining_accounts.len());
        accounts.push(solana_program::instruction::AccountMeta::new(
            *self.account.key,
            false,
        ));
        accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.authority.key,
            true,
        ));
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
        let mut data = borsh::to_vec(&ExtendInstructionData::new()).unwrap();
        let mut args = borsh::to_vec(&self.__args).unwrap();
        data.append(&mut args);

        let instruction = solana_program::instruction::Instruction {
            program_id: crate::PROGRAM_METADATA_ID,
            accounts,
            data,
        };
        let mut account_infos = Vec::with_capacity(5 + remaining_accounts.len());
        account_infos.push(self.__program.clone());
        account_infos.push(self.account.clone());
        account_infos.push(self.authority.clone());
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

/// Instruction builder for `Extend` via CPI.
///
/// ### Accounts:
///
///   0. `[writable]` account
///   1. `[signer]` authority
///   2. `[optional]` program
///   3. `[optional]` program_data
#[derive(Clone, Debug)]
pub struct ExtendCpiBuilder<'a, 'b> {
    instruction: Box<ExtendCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> ExtendCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(ExtendCpiBuilderInstruction {
            __program: program,
            account: None,
            authority: None,
            program: None,
            program_data: None,
            length: None,
            __remaining_accounts: Vec::new(),
        });
        Self { instruction }
    }
    /// Buffer or metadata account.
    #[inline(always)]
    pub fn account(
        &mut self,
        account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.account = Some(account);
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
    pub fn length(&mut self, length: u16) -> &mut Self {
        self.instruction.length = Some(length);
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
        let args = ExtendInstructionArgs {
            length: self.instruction.length.clone().expect("length is not set"),
        };
        let instruction = ExtendCpi {
            __program: self.instruction.__program,

            account: self.instruction.account.expect("account is not set"),

            authority: self.instruction.authority.expect("authority is not set"),

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
struct ExtendCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    length: Option<u16>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
