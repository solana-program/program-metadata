use pinocchio::program_error::ProgramError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProgramMetadataError {
    /// 0 - The program account is not executable.
    NotExecutableAccount,

    /// 1 - The program state is invalid.
    InvalidProgramState,

    /// 2 - The program data account is invalid.
    InvalidProgramDataAccount,

    /// 3 - The metadata account is immutable.
    ImmutableMetadataAccount,

    /// 4 - The account data length is invalid.
    InvalidDataLength,
}

impl From<ProgramMetadataError> for ProgramError {
    fn from(e: ProgramMetadataError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
