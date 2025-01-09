use pinocchio::program_error::ProgramError;

use super::{DataSource, DirectData, ExternalData, UrlData};

/// Metadata account data.
pub enum Data<'a> {
    Direct(DirectData<'a>),
    Url(UrlData<'a>),
    External(&'a ExternalData),
}

impl<'a> Data<'a> {
    pub fn load(data_source: DataSource, bytes: &'a [u8]) -> Result<Data<'a>, ProgramError> {
        Ok(match data_source {
            DataSource::Direct => Data::Direct(DirectData(bytes)),
            DataSource::Url => Data::Url(UrlData(
                core::str::from_utf8(bytes).map_err(|_| ProgramError::InvalidAccountData)?,
            )),
            DataSource::External => {
                if bytes.len() < ExternalData::LEN {
                    return Err(ProgramError::InvalidAccountData);
                }
                Data::External(unsafe { &*(bytes.as_ptr() as *const ExternalData) })
            }
        })
    }

    pub(crate) unsafe fn load_unchecked(data_source: DataSource, bytes: &'a [u8]) -> Data<'a> {
        match data_source {
            DataSource::Direct => Data::Direct(DirectData(bytes)),
            DataSource::Url => Data::Url(UrlData(core::str::from_utf8_unchecked(bytes))),
            DataSource::External => Data::External(&*(bytes.as_ptr() as *const ExternalData)),
        }
    }
}
