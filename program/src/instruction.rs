use pinocchio::program_error::ProgramError;

#[derive(Clone, Debug)]
#[rustfmt::skip]
pub enum ProgramMetadataInstruction {
    /// Writes data to a pre-funded (buffer) account.
    /// 
    /// This instruction allocated and assign the account to the
    /// program if needed.
    /// 
    /// 0. `[w]` The account to write to.
    /// 1. `[b]` The data to write.
    Write,

    /// Initializes a canonical metadata account.
    /// 
    /// A canonical metadata account is an account initialized
    /// by the program upgrade authority.
    InitializeCanonical,

    /// Initializes a "third-porty" metadata account.
    InitializeThirdParty,

    /// Updates the data of a metadata account from an buffer account.
    Update,

    /// Sets the authority of a metadata account.
    SetAuthority,

    /// Closes a metadata account.
    Close,
}

impl TryFrom<&u8> for ProgramMetadataInstruction {
    type Error = ProgramError;

    fn try_from(value: &u8) -> Result<Self, Self::Error> {
        match *value {
            0 => Ok(ProgramMetadataInstruction::Write),
            1 => Ok(ProgramMetadataInstruction::InitializeCanonical),
            2 => Ok(ProgramMetadataInstruction::InitializeThirdParty),
            3 => Ok(ProgramMetadataInstruction::Update),
            4 => Ok(ProgramMetadataInstruction::SetAuthority),
            5 => Ok(ProgramMetadataInstruction::Close),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}
