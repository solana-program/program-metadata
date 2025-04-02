//! A program to store metadata information for programs.

#![no_std]

pub mod entrypoint;
pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

pinocchio_pubkey::declare_id!("ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S");

solana_security_txt::security_txt! {
    // Required fields
    name: "SPL Program Metadata",
    project_url: "https://github.com/solana-program/program-metadata",
    contacts: "link:https://github.com/solana-program/program-metadata/security/advisories/new,email:security@anza.xyz,link:https://solana.com/discord",
    policy: "https://github.com/solana-program/program-metadata/blob/master/SECURITY.md",

    // Optional Fields
    preferred_languages: "en",
    source_code: "https://github.com/solana-program/program-metadata/tree/master/program"
}
