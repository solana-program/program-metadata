//! This code was AUTOGENERATED using the codama library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun codama to update it.
//!
//! <https://github.com/codama-idl/codama>
//!

use crate::generated::types::AccountDiscriminator;
use crate::generated::types::Seed;
use crate::hooked::ZeroableOptionPubkey;
use borsh::BorshDeserialize;
use borsh::BorshSerialize;
use kaigan::types::RemainderVec;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Buffer {
    pub discriminator: AccountDiscriminator,
    pub program: ZeroableOptionPubkey,
    pub authority: ZeroableOptionPubkey,
    pub canonical: bool,
    pub seed: Seed,
    pub data: RemainderVec<u8>,
}

impl Buffer {
    #[inline(always)]
    pub fn from_bytes(data: &[u8]) -> Result<Self, std::io::Error> {
        let mut data = data;
        Self::deserialize(&mut data)
    }
}

impl<'a> TryFrom<&solana_program::account_info::AccountInfo<'a>> for Buffer {
    type Error = std::io::Error;

    fn try_from(
        account_info: &solana_program::account_info::AccountInfo<'a>,
    ) -> Result<Self, Self::Error> {
        let mut data: &[u8] = &(*account_info.data).borrow();
        Self::deserialize(&mut data)
    }
}

#[cfg(feature = "fetch")]
pub fn fetch_buffer(
    rpc: &solana_client::rpc_client::RpcClient,
    address: &Pubkey,
) -> Result<crate::shared::DecodedAccount<Buffer>, std::io::Error> {
    let accounts = fetch_all_buffer(rpc, &[*address])?;
    Ok(accounts[0].clone())
}

#[cfg(feature = "fetch")]
pub fn fetch_all_buffer(
    rpc: &solana_client::rpc_client::RpcClient,
    addresses: &[Pubkey],
) -> Result<Vec<crate::shared::DecodedAccount<Buffer>>, std::io::Error> {
    let accounts = rpc
        .get_multiple_accounts(&addresses)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let mut decoded_accounts: Vec<crate::shared::DecodedAccount<Buffer>> = Vec::new();
    for i in 0..addresses.len() {
        let address = addresses[i];
        let account = accounts[i].as_ref().ok_or(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Account not found: {}", address),
        ))?;
        let data = Buffer::from_bytes(&account.data)?;
        decoded_accounts.push(crate::shared::DecodedAccount {
            address,
            account: account.clone(),
            data,
        });
    }
    Ok(decoded_accounts)
}

#[cfg(feature = "fetch")]
pub fn fetch_maybe_buffer(
    rpc: &solana_client::rpc_client::RpcClient,
    address: &Pubkey,
) -> Result<crate::shared::MaybeAccount<Buffer>, std::io::Error> {
    let accounts = fetch_all_maybe_buffer(rpc, &[*address])?;
    Ok(accounts[0].clone())
}

#[cfg(feature = "fetch")]
pub fn fetch_all_maybe_buffer(
    rpc: &solana_client::rpc_client::RpcClient,
    addresses: &[Pubkey],
) -> Result<Vec<crate::shared::MaybeAccount<Buffer>>, std::io::Error> {
    let accounts = rpc
        .get_multiple_accounts(&addresses)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    let mut decoded_accounts: Vec<crate::shared::MaybeAccount<Buffer>> = Vec::new();
    for i in 0..addresses.len() {
        let address = addresses[i];
        if let Some(account) = accounts[i].as_ref() {
            let data = Buffer::from_bytes(&account.data)?;
            decoded_accounts.push(crate::shared::MaybeAccount::Exists(
                crate::shared::DecodedAccount {
                    address,
                    account: account.clone(),
                    data,
                },
            ));
        } else {
            decoded_accounts.push(crate::shared::MaybeAccount::NotFound(address));
        }
    }
    Ok(decoded_accounts)
}
