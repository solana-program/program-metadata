use pinocchio::program_error::ProgramError;

#[derive(Clone, Debug)]
pub enum ProgramMetadataInstruction {
    /// Writes data to a pre-funded (buffer) account.
    ///
    /// This instruction allocated and assign the account to the
    /// program if needed.
    ///
    /// 0. `[s,w]` The pre-funded account to write.
    ///
    /// Instruction data: bytes to write.
    Write,

    /// Initializes a canonical metadata account.
    ///
    /// A canonical metadata account is an account initialized
    /// by the program upgrade authority.
    ///
    /// 0. `[w]` The metadata account to initialize.
    /// 1. `[w,o]` (Optional) Buffer account to copy data from.
    /// 2. `[s]` The program upgrade authority.
    /// 3. `[ ]` Program account.
    /// 4. `[ ]` Program data account.
    /// 5. `[ ]` System program.
    Initialize,

    /// Sets the authority of a metadata account.
    SetAuthority,

    /// Updates the data of a metadata account from an buffer account.
    SetData,

    /// Sets the metadata account as immutable.
    SetImmutable,

    /// Withdraws excess lamports from a metadata account.
    WithdrawExcessLamports,

    /// Closes a metadata account.
    Close,
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
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}
