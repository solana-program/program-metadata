use std::{fmt::Display, str::from_utf8};

use borsh::{BorshDeserialize, BorshSerialize};

use crate::types::Seed;

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum RemainderOption<T: BorshSerialize + BorshDeserialize + Display> {
    Some(T),
    None,
}

impl<T: BorshSerialize + BorshDeserialize + Display> Display for RemainderOption<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RemainderOption::Some(item) => item.fmt(f),
            RemainderOption::None => Ok(()),
        }
    }
}

impl<T: BorshSerialize + BorshDeserialize + Display> BorshSerialize for RemainderOption<T> {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()>
    where
        Self: Sized,
    {
        match &self {
            Self::Some(item) => item.serialize(writer),
            Self::None => Ok(()),
        }
    }
}

impl<T: BorshSerialize + BorshDeserialize + Display> BorshDeserialize for RemainderOption<T> {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self>
    where
        Self: Sized,
    {
        match T::deserialize_reader(reader) {
            Ok(item) => Ok(RemainderOption::Some(item)),
            Err(_) => Ok(RemainderOption::None),
        }
    }
}

impl<T: BorshSerialize + BorshDeserialize + Display> From<Option<T>> for RemainderOption<T> {
    fn from(item: Option<T>) -> Self {
        match item {
            Some(item) => RemainderOption::Some(item),
            None => RemainderOption::None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum RemainderOptionSeed {
    Some(Seed),
    None,
}

impl Display for RemainderOptionSeed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RemainderOptionSeed::Some(item) => from_utf8(item).map_err(|_| std::fmt::Error)?.fmt(f),
            RemainderOptionSeed::None => Ok(()),
        }
    }
}

impl BorshSerialize for RemainderOptionSeed {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()>
    where
        Self: Sized,
    {
        match &self {
            Self::Some(item) => item.serialize(writer),
            Self::None => Ok(()),
        }
    }
}

impl BorshDeserialize for RemainderOptionSeed {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self>
    where
        Self: Sized,
    {
        match Seed::deserialize_reader(reader) {
            Ok(item) => Ok(RemainderOptionSeed::Some(item)),
            Err(_) => Ok(RemainderOptionSeed::None),
        }
    }
}

impl From<Option<Seed>> for RemainderOptionSeed {
    fn from(item: Option<Seed>) -> Self {
        match item {
            Some(item) => RemainderOptionSeed::Some(item),
            None => RemainderOptionSeed::None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub enum RemainderOptionBytes {
    Some(Vec<u8>),
    None,
}

impl Display for RemainderOptionBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RemainderOptionBytes::Some(item) => {
                from_utf8(item).map_err(|_| std::fmt::Error)?.fmt(f)
            }
            RemainderOptionBytes::None => Ok(()),
        }
    }
}

impl BorshSerialize for RemainderOptionBytes {
    fn serialize<W: std::io::Write>(&self, writer: &mut W) -> std::io::Result<()>
    where
        Self: Sized,
    {
        match &self {
            Self::Some(item) => item.serialize(writer),
            Self::None => Ok(()),
        }
    }
}

impl BorshDeserialize for RemainderOptionBytes {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self>
    where
        Self: Sized,
    {
        match Vec::<u8>::deserialize_reader(reader) {
            Ok(item) => Ok(RemainderOptionBytes::Some(item)),
            Err(_) => Ok(RemainderOptionBytes::None),
        }
    }
}

impl From<Option<Vec<u8>>> for RemainderOptionBytes {
    fn from(item: Option<Vec<u8>>) -> Self {
        match item {
            Some(item) => RemainderOptionBytes::Some(item),
            None => RemainderOptionBytes::None,
        }
    }
}
