//! This code was AUTOGENERATED using the codama library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun codama to update it.
//!
//! <https://github.com/codama-idl/codama>
//!

use borsh::BorshDeserialize;
use borsh::BorshSerialize;
use solana_program::pubkey::Pubkey;

/// Accounts.
#[derive(Debug)]
pub struct SetAuthority {
    /// Metadata or buffer account.
    pub account: solana_program::pubkey::Pubkey,
    /// Current authority account.
    pub authority: solana_program::pubkey::Pubkey,
    /// Program account.
    pub program: Option<solana_program::pubkey::Pubkey>,
    /// Program data account.
    pub program_data: Option<solana_program::pubkey::Pubkey>,
}

impl SetAuthority {
    pub fn instruction(
        &self,
        args: SetAuthorityInstructionArgs,
    ) -> solana_program::instruction::Instruction {
        self.instruction_with_remaining_accounts(args, &[])
    }
    #[allow(clippy::arithmetic_side_effects)]
    #[allow(clippy::vec_init_then_push)]
    pub fn instruction_with_remaining_accounts(
        &self,
        args: SetAuthorityInstructionArgs,
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
        let mut data = borsh::to_vec(&SetAuthorityInstructionData::new()).unwrap();
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
pub struct SetAuthorityInstructionData {
    discriminator: u8,
}

impl SetAuthorityInstructionData {
    pub fn new() -> Self {
        Self { discriminator: 2 }
    }
}

impl Default for SetAuthorityInstructionData {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SetAuthorityInstructionArgs {
    pub new_authority: Option<Pubkey>,
}

/// Instruction builder for `SetAuthority`.
///
/// ### Accounts:
///
///   0. `[writable]` account
///   1. `[signer]` authority
///   2. `[optional]` program
///   3. `[optional]` program_data
#[derive(Clone, Debug, Default)]
pub struct SetAuthorityBuilder {
    account: Option<solana_program::pubkey::Pubkey>,
    authority: Option<solana_program::pubkey::Pubkey>,
    program: Option<solana_program::pubkey::Pubkey>,
    program_data: Option<solana_program::pubkey::Pubkey>,
    new_authority: Option<Pubkey>,
    __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl SetAuthorityBuilder {
    pub fn new() -> Self {
        Self::default()
    }
    /// Metadata or buffer account.
    #[inline(always)]
    pub fn account(&mut self, account: solana_program::pubkey::Pubkey) -> &mut Self {
        self.account = Some(account);
        self
    }
    /// Current authority account.
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
    /// `[optional argument]`
    #[inline(always)]
    pub fn new_authority(&mut self, new_authority: Pubkey) -> &mut Self {
        self.new_authority = Some(new_authority);
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
        let accounts = SetAuthority {
            account: self.account.expect("account is not set"),
            authority: self.authority.expect("authority is not set"),
            program: self.program,
            program_data: self.program_data,
        };
        let args = SetAuthorityInstructionArgs {
            new_authority: self.new_authority.clone(),
        };

        accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
    }
}

/// `set_authority` CPI accounts.
pub struct SetAuthorityCpiAccounts<'a, 'b> {
    /// Metadata or buffer account.
    pub account: &'b solana_program::account_info::AccountInfo<'a>,
    /// Current authority account.
    pub authority: &'b solana_program::account_info::AccountInfo<'a>,
    /// Program account.
    pub program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program data account.
    pub program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
}

/// `set_authority` CPI instruction.
pub struct SetAuthorityCpi<'a, 'b> {
    /// The program to invoke.
    pub __program: &'b solana_program::account_info::AccountInfo<'a>,
    /// Metadata or buffer account.
    pub account: &'b solana_program::account_info::AccountInfo<'a>,
    /// Current authority account.
    pub authority: &'b solana_program::account_info::AccountInfo<'a>,
    /// Program account.
    pub program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// Program data account.
    pub program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    /// The arguments for the instruction.
    pub __args: SetAuthorityInstructionArgs,
}

impl<'a, 'b> SetAuthorityCpi<'a, 'b> {
    pub fn new(
        program: &'b solana_program::account_info::AccountInfo<'a>,
        accounts: SetAuthorityCpiAccounts<'a, 'b>,
        args: SetAuthorityInstructionArgs,
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
        let mut data = borsh::to_vec(&SetAuthorityInstructionData::new()).unwrap();
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

/// Instruction builder for `SetAuthority` via CPI.
///
/// ### Accounts:
///
///   0. `[writable]` account
///   1. `[signer]` authority
///   2. `[optional]` program
///   3. `[optional]` program_data
#[derive(Clone, Debug)]
pub struct SetAuthorityCpiBuilder<'a, 'b> {
    instruction: Box<SetAuthorityCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> SetAuthorityCpiBuilder<'a, 'b> {
    pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
        let instruction = Box::new(SetAuthorityCpiBuilderInstruction {
            __program: program,
            account: None,
            authority: None,
            program: None,
            program_data: None,
            new_authority: None,
            __remaining_accounts: Vec::new(),
        });
        Self { instruction }
    }
    /// Metadata or buffer account.
    #[inline(always)]
    pub fn account(
        &mut self,
        account: &'b solana_program::account_info::AccountInfo<'a>,
    ) -> &mut Self {
        self.instruction.account = Some(account);
        self
    }
    /// Current authority account.
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
    /// `[optional argument]`
    #[inline(always)]
    pub fn new_authority(&mut self, new_authority: Pubkey) -> &mut Self {
        self.instruction.new_authority = Some(new_authority);
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
        let args = SetAuthorityInstructionArgs {
            new_authority: self.instruction.new_authority.clone(),
        };
        let instruction = SetAuthorityCpi {
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
struct SetAuthorityCpiBuilderInstruction<'a, 'b> {
    __program: &'b solana_program::account_info::AccountInfo<'a>,
    account: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    program_data: Option<&'b solana_program::account_info::AccountInfo<'a>>,
    new_authority: Option<Pubkey>,
    /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
    __remaining_accounts: Vec<(
        &'b solana_program::account_info::AccountInfo<'a>,
        bool,
        bool,
    )>,
}
