use pinocchio::program_error::ProgramError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProgramMetadataError {
    /// 0 - Error deserializing an account
    DeserializationError,
}

impl From<ProgramMetadataError> for ProgramError {
    fn from(e: ProgramMetadataError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
