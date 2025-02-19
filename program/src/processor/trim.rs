use pinocchio::{
    account_info::AccountInfo, program_error::ProgramError, sysvars::rent::Rent, ProgramResult,
};

use crate::state::{buffer::Buffer, header::Header, AccountDiscriminator};

use super::{validate_authority, validate_metadata};

/// Processor for the [`Trim`](`crate::instruction::ProgramMetadataInstruction::Trim`)
/// instruction.
pub fn trim(accounts: &[AccountInfo]) -> ProgramResult {
    // Access accounts.

    let [account, authority, program, program_data, destination, rent_sysvar] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.

    // account
    // - authority must be a signer (checked by `validate_authority`)
    // - must be a buffer or metadata account
    // - must have a valid authority

    if account.data_is_empty() {
        return Err(ProgramError::UninitializedAccount);
    };

    let length = {
        // SAFETY: scoped immutable borrow of `account` account data.
        let data = unsafe { account.borrow_data_unchecked() };
        // SAFETY: `account` is guaranteed to not be empty.
        let discriminator = unsafe { data.get_unchecked(0) };

        match AccountDiscriminator::try_from(*discriminator) {
            Ok(AccountDiscriminator::Buffer) => {
                let buffer = Buffer::from_bytes(data)?;
                validate_authority(buffer, authority, program, program_data)?;
                account.data_len()
            }
            Ok(AccountDiscriminator::Metadata) => {
                let metadata = validate_metadata(account)?;
                validate_authority(metadata, authority, program, program_data)?;
                // The length of the data is never more than `10_000_000`.
                Header::LEN + metadata.data_length() as usize
            }
            _ => return Err(ProgramError::UninitializedAccount),
        }
    };

    // Withdraw the excess lamports, resizing the account if needed.

    let minimum_balance = {
        // SAFETY: single immutable borrow of `rent_sysver` account data.
        let rent = unsafe { Rent::from_bytes(rent_sysvar.borrow_data_unchecked()) };
        rent.minimum_balance(length)
    };

    account.realloc(length, false)?;

    // SAFETY: single mutable borrow if `account` and `destination` lamports.
    unsafe {
        let account_lamports = account.borrow_mut_lamports_unchecked();
        let destination_lamports = destination.borrow_mut_lamports_unchecked();
        // Current lamports should always be greater than or equal to the minimum
        // balance since the account is rent exempt.
        *destination_lamports += *account_lamports - minimum_balance;
        *account_lamports = minimum_balance;
    }

    Ok(())
}
