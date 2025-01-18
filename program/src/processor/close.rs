use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::{buffer::Buffer, AccountDiscriminator};

use super::{validate_authority, validate_metadata};

/// Closes a program-owned account.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [implicit] The `account` to close is owned by the Program Metadata program. Implicitly checked by closing to the account.
pub fn close(accounts: &[AccountInfo]) -> ProgramResult {
    let [account, authority, program, program_data, destination] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    if !authority.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let account_data = if account.data_is_empty() {
        return Err(ProgramError::UninitializedAccount);
    } else {
        unsafe { account.borrow_data_unchecked() }
    };

    // Accounts validation.
    //  - account: program owned is implicitly checked since we are writing
    //    to the account

    // We only need to validate the authority if it is not a keypair buffer,
    // since we already validated that the authority is a signer.
    if account.key() != authority.key() {
        match AccountDiscriminator::try_from(account_data[0])? {
            AccountDiscriminator::Buffer => {
                let buffer = unsafe { Buffer::load_unchecked(account_data) };
                validate_authority(buffer, authority, program, program_data)?
            }
            AccountDiscriminator::Metadata => {
                let header = validate_metadata(account)?;
                validate_authority(header, authority, program, program_data)?
            }
            _ => return Err(ProgramError::InvalidAccountData),
        }
    }

    // Move the lamports to the destination account.
    unsafe {
        let account_lamports = account.borrow_mut_lamports_unchecked();
        let destination_lamports = destination.borrow_mut_lamports_unchecked();
        *destination_lamports += *account_lamports;
        *account_lamports = 0;
    }

    account.close()
}
