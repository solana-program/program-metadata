use pinocchio::{account_info::AccountInfo, program_error::ProgramError, ProgramResult};

use crate::state::AccountDiscriminator;

use super::validate_update;

/// Closes a program-owned account.
pub fn close(accounts: &[AccountInfo]) -> ProgramResult {
    let [account, authority, program, program_data, destination] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    let account_data = if account.data_is_empty() {
        return Err(ProgramError::UninitializedAccount);
    } else {
        unsafe { account.borrow_data_unchecked() }
    };

    // Accounts validation.
    //  - account: program owned is implicitly checked since we are writing
    //    to the account

    match AccountDiscriminator::try_from(account_data[0])? {
        AccountDiscriminator::Buffer => {
            // The authority of a buffer account must be the buffer account
            // itself.
            if !(account.key() == authority.key() && authority.is_signer()) {
                return Err(ProgramError::MissingRequiredSignature);
            }
        }
        AccountDiscriminator::Metadata => {
            // Metadata and authority validation is done in the `validate_update`.
            validate_update(account, authority, program, program_data)?
        }
        _ => return Err(ProgramError::InvalidAccountData),
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
