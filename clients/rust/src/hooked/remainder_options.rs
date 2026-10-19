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
            Self::Some(item) => writer.write_all(item),
            Self::None => Ok(()),
        }
    }
}

impl BorshDeserialize for RemainderOptionBytes {
    fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self>
    where
        Self: Sized,
    {
        let mut item = Vec::new();
        reader.read_to_end(&mut item)?;
        if item.is_empty() {
            Ok(RemainderOptionBytes::None)
        } else {
            Ok(RemainderOptionBytes::Some(item))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::instructions::WriteInstructionArgs;

    #[test]
    fn remainder_option_bytes_some_is_serialized_without_prefix() {
        let bytes = borsh::to_vec(&RemainderOptionBytes::Some(vec![1, 2, 3])).unwrap();
        assert_eq!(bytes, vec![1, 2, 3]);
    }

    #[test]
    fn remainder_option_bytes_none_is_serialized_as_empty() {
        let bytes = borsh::to_vec(&RemainderOptionBytes::None).unwrap();
        assert!(bytes.is_empty());
    }

    #[test]
    fn remainder_option_bytes_deserializes_remaining_bytes() {
        assert_eq!(
            borsh::from_slice::<RemainderOptionBytes>(&[1, 2, 3]).unwrap(),
            RemainderOptionBytes::Some(vec![1, 2, 3])
        );
        assert_eq!(
            borsh::from_slice::<RemainderOptionBytes>(&[]).unwrap(),
            RemainderOptionBytes::None
        );
    }

    #[test]
    fn remainder_option_bytes_round_trip() {
        for value in [
            RemainderOptionBytes::Some(vec![3, 0, 0, 0, 255]),
            RemainderOptionBytes::None,
        ] {
            let bytes = borsh::to_vec(&value).unwrap();
            assert_eq!(
                borsh::from_slice::<RemainderOptionBytes>(&bytes).unwrap(),
                value
            );
        }
    }

    #[test]
    fn write_instruction_args_append_data_after_offset() {
        let args = WriteInstructionArgs {
            offset: 7,
            data: RemainderOptionBytes::Some(vec![1, 2, 3]),
        };
        let bytes = borsh::to_vec(&args).unwrap();
        assert_eq!(bytes, vec![7, 0, 0, 0, 1, 2, 3]);
        assert_eq!(
            borsh::from_slice::<WriteInstructionArgs>(&bytes).unwrap(),
            args
        );
    }
}
