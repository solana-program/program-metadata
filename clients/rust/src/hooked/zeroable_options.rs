use std::fmt::Display;

use borsh::{BorshDeserialize, BorshSerialize};
use solana_pubkey::Pubkey;

pub type ZeroableOptionOffset = ZeroableOption<u32>;
pub type ZeroableOptionPubkey = ZeroableOption<Pubkey>;

pub trait Zeroable: PartialEq {
    const ZERO: Self;
}

impl Zeroable for u32 {
    const ZERO: Self = 0;
}

impl Zeroable for Pubkey {
    const ZERO: Self = Pubkey::new_from_array([0; 32]);
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum ZeroableOption<T: BorshSerialize + BorshDeserialize + Zeroable + Display> {
    Some(T),
    None,
}

impl<T: BorshSerialize + BorshDeserialize + Zeroable + Display> Display for ZeroableOption<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ZeroableOption::Some(item) => item.fmt(f),
            ZeroableOption::None => T::ZERO.fmt(f),
        }
    }
}

impl<T: BorshSerialize + BorshDeserialize + Zeroable + Display> BorshSerialize
    for ZeroableOption<T>
{
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()>
    where
        Self: Sized,
    {
        match &self {
            Self::Some(item) => item.serialize(writer),
            Self::None => T::ZERO.serialize(writer),
        }
    }
}

impl<T: BorshSerialize + BorshDeserialize + Zeroable + Display> BorshDeserialize
    for ZeroableOption<T>
{
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self>
    where
        Self: Sized,
    {
        let value = T::deserialize_reader(reader)?;
        if value == T::ZERO {
            Ok(ZeroableOption::None)
        } else {
            Ok(ZeroableOption::Some(value))
        }
    }
}

impl<T: BorshSerialize + BorshDeserialize + Zeroable + Display> From<Option<T>>
    for ZeroableOption<T>
{
    fn from(item: Option<T>) -> Self {
        match item {
            Some(item) => ZeroableOption::Some(item),
            None => ZeroableOption::None,
        }
    }
}
