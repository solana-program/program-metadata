use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey, ProgramResult,
};

use crate::{
    processor::validate_authority,
    state::{buffer::Buffer, header::Header, AccountDiscriminator, Zeroable},
};

/// Processor for the [`SetAuthority`](`crate::instruction::ProgramMetadataInstruction::SetAuthority`)
/// instruction.
pub fn set_authority(accounts: &[AccountInfo], instruction_data: &[u8]) -> ProgramResult {
    // Validates the instruction data.

    let [has_new_authority, new_authority @ ..] = instruction_data else {
        return Err(ProgramError::InvalidInstructionData);
    };

    // Access accounts.

    let [account, authority, program, program_data] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // authority
    // - must be a signer

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // account
    // - must be a buffer or metadata account
    // - must be mutable (metadata)
    // - cannot be a non-canonical metadata account
    // - must have a valid authority

    // SAFETY: single mutable borrow of `account` account data.
    let account_data = unsafe { account.borrow_mut_data_unchecked() };

    match AccountDiscriminator::from_bytes(account_data)? {
        Some(AccountDiscriminator::Buffer) => {
            let buffer = Buffer::from_bytes_mut(account_data)?;

            validate_authority(buffer, authority, program, program_data)?;

            if *has_new_authority == 0 {
                return Err(ProgramError::InvalidArgument);
            }

            let new_authority: Pubkey = new_authority
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?;
            buffer.authority = new_authority.into();
        }
        Some(AccountDiscriminator::Metadata) => {
            let header = Header::from_bytes_mut(account_data)?;

            if !header.canonical() {
                return Err(ProgramError::InvalidAccountData);
            }

            validate_authority(header, authority, program, program_data)?;

            header.authority = if *has_new_authority == 0 {
                Pubkey::ZERO.into()
            } else {
                let new_authority: Pubkey = new_authority
                    .try_into()
                    .map_err(|_| ProgramError::InvalidInstructionData)?;
                new_authority.into()
            };
        }
        _ => return Err(ProgramError::InvalidAccountData),
    }

    Ok(())
}
