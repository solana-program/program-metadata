use pinocchio::{
    account::AccountView, error::ProgramError, sysvars::rent::Rent, ProgramResult, Resize,
};

use crate::state::{buffer::Buffer, header::Header, AccountDiscriminator};

use super::{validate_authority, validate_metadata};

/// Processor for the [`Trim`](`crate::instruction::ProgramMetadataInstruction::Trim`)
/// instruction.
#[allow(clippy::arithmetic_side_effects)]
pub fn trim(accounts: &mut [AccountView]) -> ProgramResult {
    // Access accounts.

    let [account, authority, program, program_data, destination, rent_sysvar] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Account validation.
    //
    // Note that program owned and writable checks are done implicitly by writing
    // to the account.

    // account
    // - authority must be a signer (checked by `validate_authority`)
    // - must be a buffer or metadata account
    // - must have a valid authority

    if account.is_data_empty() {
        return Err(ProgramError::UninitializedAccount);
    };

    let length = {
        // SAFETY: scoped immutable borrow of `account` account data.
        let data = unsafe { account.borrow_unchecked() };
        // SAFETY: `account` is guaranteed to not be empty.
        let discriminator = unsafe { data.get_unchecked(0) };

        match AccountDiscriminator::try_from(*discriminator) {
            Ok(AccountDiscriminator::Buffer) => {
                let buffer = Buffer::from_bytes(data)?;
                validate_authority(buffer, authority, program, program_data)?;
                account.data_len()
            }
            Ok(AccountDiscriminator::Metadata) => {
                let header = validate_metadata(data)?;
                validate_authority(header, authority, program, program_data)?;
                // The length of the data is never more than `10_000_000`.
                Header::LEN + header.data_length() as usize
            }
            _ => return Err(ProgramError::UninitializedAccount),
        }
    };

    // Withdraw the excess lamports, resizing the account if needed.

    let minimum_balance = {
        // SAFETY: single immutable borrow of `rent_sysver` account data.
        let rent = unsafe { Rent::from_account_view_unchecked(rent_sysvar)? };
        rent.try_minimum_balance(length)?
    };

    // SAFETY: `account` is not borrowed at this point.
    unsafe { account.resize_unchecked(length)? };

    // Current lamports should always be greater than or equal to the minimum
    // balance since the account must be rent exempt.
    let excess_lamports = account
        .lamports()
        .checked_sub(minimum_balance)
        .ok_or(ProgramError::AccountNotRentExempt)?;
    let destination_lamports = destination.lamports();

    destination.set_lamports(
        destination_lamports
            .checked_add(excess_lamports)
            .ok_or(ProgramError::ArithmeticOverflow)?,
    );
    account.set_lamports(minimum_balance);

    Ok(())
}
