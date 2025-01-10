use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, sysvars::rent::Rent, ProgramResult,
};

use super::validate_authority;

/// Withdraws excess lamports from a metadata account.
///
/// ## Validation
/// The following validation checks are performed:
///
/// - [implicit] The `metadata` account is owned by the Program Metadata program. Implicitly checked by writing to the account.
pub fn withdraw_excess_lamports(accounts: &[AccountInfo]) -> ProgramResult {
    let [metadata, authority, program, program_data, destination, rent_sysvar] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Accounts validation is done in the `validate_authority` function.
    validate_authority(metadata, authority, program, program_data)?;

    // Withdraw the excess lamports in the account.

    let minimum_balance = {
        let rent = unsafe { Rent::from_bytes(rent_sysvar.borrow_data_unchecked()) };
        rent.minimum_balance(metadata.data_len())
    };

    unsafe {
        let metadata_lamports = metadata.borrow_mut_lamports_unchecked();
        let destination_lamports = destination.borrow_mut_lamports_unchecked();
        // Current lamports should always be greater than or equal to the minimum
        // balance since the account is rent exempt.
        *destination_lamports += *metadata_lamports - minimum_balance;
        *metadata_lamports = minimum_balance;
    }

    Ok(())
}
