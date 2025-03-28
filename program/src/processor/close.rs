use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::{buffer::Buffer, AccountDiscriminator};

use super::{validate_authority, validate_metadata};

/// Processor for the [`Close`](`crate::instruction::ProgramMetadataInstruction::Close`)
/// instruction.
pub fn close(accounts: &[AccountInfo]) -> ProgramResult {
    // Access accounts.

    let [account, authority, program, program_data, destination] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Accounts validation.
    //
    // Note that program owned and writable checks are done implicitly by writing
    // to the account.

    // authority
    // - must be a signer

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // account
    // - must have data
    // - authority must match (if not a keypair buffer)

    let account_data = if account.data_is_empty() {
        return Err(ProgramError::UninitializedAccount);
    } else {
        unsafe { account.borrow_data_unchecked() }
    };

    // We only need to validate the authority if it is not a keypair buffer,
    // since we already validated that the authority is a signer.
    if account.key() != authority.key() {
        match AccountDiscriminator::try_from(account_data[0])? {
            AccountDiscriminator::Buffer => {
                let buffer = unsafe { Buffer::from_bytes_unchecked(account_data) };
                validate_authority(buffer, authority, program, program_data)?
            }
            AccountDiscriminator::Metadata => {
                let header = validate_metadata(account)?;
                validate_authority(header, authority, program, program_data)?
            }
            _ => return Err(ProgramError::InvalidAccountData),
        }
    }

    // Move the lamports to the destination account and close the account.

    // SAFETY: There are no active borrows to accounts' lamports.
    unsafe {
        let account_lamports = account.borrow_mut_lamports_unchecked();
        let destination_lamports = destination.borrow_mut_lamports_unchecked();

        *destination_lamports = destination_lamports
            .checked_add(*account_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        *account_lamports = 0;
    }

    account.close()
}
