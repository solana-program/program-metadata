use pinocchio::{account::AccountView, error::ProgramError, ProgramResult};

use crate::state::{buffer::Buffer, AccountDiscriminator};

use super::{validate_authority, validate_metadata};

/// Processor for the [`Close`](`crate::instruction::ProgramMetadataInstruction::Close`)
/// instruction.
pub fn close(accounts: &mut [AccountView]) -> ProgramResult {
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
    // - authority must match

    let account_data = if account.is_data_empty() {
        return Err(ProgramError::UninitializedAccount);
    } else {
        unsafe { account.borrow_unchecked() }
    };

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

    // Move the lamports to the destination account and close the account.

    let account_lamports = account.lamports();
    let destination_lamports = destination.lamports();

    destination.set_lamports(
        destination_lamports
            .checked_add(account_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    );
    account.set_lamports(0);

    account.close()
}
