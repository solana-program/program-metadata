// Disable warnings for generated code since these need to be fixed
// in the codama generator.
#![allow(dead_code)]
#![allow(clippy::io_other_error)]

mod generated;
mod hooked;

pub use generated::programs::PROGRAM_METADATA_ID as ID;
pub use generated::*;
