use pinocchio::program_error::ProgramError;

#[derive(Clone, Copy, Debug)]
pub enum ProgramMetadataInstruction {
    /// Writes data to a pre-funded buffer.
    ///
    /// The buffer account must be allocated and pre-funded with enough lamports
    /// to cover the storage cost of the data being written.
    ///
    /// Accounts expected by this instruction:
    ///
    /// 0. `[w]` Buffer to write to.
    /// 1. `[s]` Authority account.
    ///
    /// Instruction data:
    ///
    /// - `u32`: offset to write to
    /// - `[u8]`: bytes to write
    Write,

    /// Initializes a metadata account.
    ///
    /// This instruction is used to create a new metadata account for a program. This can
    /// be either a new (pre-funded) account or a buffer account that has been allocated.
    /// When not using a buffer, the data must be provided as instruction data.
    ///
    /// There are 2 optional accounts:
    ///   - `program_data`: required to validate whether the authority is the program upgrade
    ///     authority.
    ///   - `system_program`: required to allocate the account. When using a pre-allocated buffer,
    ///     this is not required.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Metadata account to initialize.
    ///  1. `[s]` Authority.
    ///  2. `[ ]` Program account.
    ///  3. `[o]` Program data account.
    ///  4. `[o]` System program.
    ///
    /// Instruction data:
    ///
    ///  - `[u8; 16]`: seed
    ///  - `u8`: encoding
    ///  - `u8`: compression
    ///  - `u8`: format
    ///  - `u8`: data source
    ///  - `[u8]`: (optional) bytes
    Initialize,

    /// Sets the authority of a buffer or metadata account.
    ///
    /// When setting the authority to a `canonical` metadata account with the
    /// program upgrade authority, both program and program data accounts are
    /// required.
    ///
    /// Special cases:
    /// - It is not possible to set an authority if the metadata account
    ///   is non-canonical, otherwise the derivation becomes invalid.
    /// - It is not possible to set an authority if the metadata account
    ///   is immutable.
    /// - If no new authority is provided for a metadata account, the
    ///   authority is removed.
    /// - It is not possible to remove the authority of a buffer account.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Buffer or metadata account.
    ///  1. `[s]` Current authority account.
    ///  2. `[o]` (optional) Program account.
    ///  3. `[o]` (optional) Program data account.
    ///
    /// Instruction data:
    ///
    ///  - `u8`: option (0 = remove authority, 1 = set authority)
    ///  - `[u8; 32]`: (optional) new authority
    SetAuthority,

    /// Sets the data and its metadata.
    ///
    /// The data can be provided as instruction data or copied from a buffer
    /// account. When setting the data to a `canonical` metadata account
    /// with the program upgrade authority, both program and program data
    /// accounts are required.
    ///
    /// Note: It is not possible to set data if the account is immutable.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Metadata account.
    ///  1. `[s]` Authority account.
    ///  2. `[o]` (optional) Buffer account to copy data from.
    ///  3. `[o]` (optional) Program account.
    ///  4. `[o]` (optional) Program data account.
    ///
    /// Instruction data:
    ///
    ///  - `u8`: encoding
    ///  - `u8`: compression
    ///  - `u8`: format
    ///  - `u8`: data source
    ///  - `[u8]`: (optional) bytes
    SetData,

    /// Sets the metadata account as immutable.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Metadata account.
    ///  1. `[s]` Authority account.
    ///  2. `[o]` (optional) Program account.
    ///  3. `[o]` (optional) Program data account.
    SetImmutable,

    /// Withdraws excess lamports from a metadata account.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Metadata account.
    ///  1. `[s]` Metadata authority account.
    ///  2. `[o]` (optional) Program account.
    ///  3. `[o]` (optional) Program data account.
    ///  5. `[w]` Destination account.
    ///  6. `[]` Rent sysvar account.
    WithdrawExcessLamports,

    /// Closes a program-owned account.
    ///
    /// The lamports in the metadata account are transferred to the destination
    /// account.
    ///
    /// Note: It is not possible to close a metadata account if the account
    /// is immutable.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Account to close.
    ///  1. `[s]` Metadata authority or buffer account.
    ///  2. `[o]` (optional) Program account.
    ///  3. `[o]` (optional) Program data account.
    ///  5. `[w]` Destination account.
    Close,

    /// Alocates a buffer account.
    ///
    /// The buffer account can either be a PDA or a keypair account.
    /// It must be pre-funded with enough lamports to cover the storage
    /// cost.
    ///
    /// This instruction is used to setup up a buffer account before data can be
    /// written to it. This is required when either initializing or updating a metadata
    /// account with data that exceeds the maximum transaction size.
    ///
    /// A `seed` value is required for PDA buffer accounts.
    ///
    /// Accounts expected by this instruction:
    ///
    /// 0. `[w]` Buffer account to allocate.
    /// 1. `[s]` Authority account.
    /// 2. `[o]` Program account.
    /// 3. `[o]` Program data account.
    /// 4. `[o]` System program.
    ///
    /// Instruction data:
    ///
    /// - `[u8; 16]`: seed (optional)
    Allocate,

    /// Extends the buffer or metadata account data by the requested length.
    ///
    /// The account is expected to be pre-funded with the required lamports
    /// for the new size.
    ///
    /// Accounts expected by this instruction:
    ///
    ///  0. `[w]` Buffer or metadata account.
    ///  1. `[s]` Authority account.
    ///  2. `[o]` (optional) Program account.
    ///  3. `[o]` (optional) Program data account.
    ///
    /// Instruction data:
    ///
    ///  - `u16`: length to add the account size
    Extend,
}

impl TryFrom<&u8> for ProgramMetadataInstruction {
    type Error = ProgramError;

    fn try_from(value: &u8) -> Result<Self, Self::Error> {
        match *value {
            0 => Ok(ProgramMetadataInstruction::Write),
            1 => Ok(ProgramMetadataInstruction::Initialize),
            2 => Ok(ProgramMetadataInstruction::SetAuthority),
            3 => Ok(ProgramMetadataInstruction::SetData),
            4 => Ok(ProgramMetadataInstruction::SetImmutable),
            5 => Ok(ProgramMetadataInstruction::WithdrawExcessLamports),
            6 => Ok(ProgramMetadataInstruction::Close),
            7 => Ok(ProgramMetadataInstruction::Allocate),
            8 => Ok(ProgramMetadataInstruction::Extend),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}
