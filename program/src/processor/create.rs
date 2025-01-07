use crate::{
    assertions::{assert_pda, assert_same_pubkeys, assert_signer, assert_writable},
    instruction::accounts::CreateAccounts,
    state::{AccountDiscriminator, Metadata},
    utils::create_account,
};
use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, system_program};

pub fn create<'a>(accounts: &'a [AccountInfo<'a>]) -> ProgramResult {
    // Accounts.
    let ctx = CreateAccounts::context(accounts)?;

    // Guards.
    let counter_bump = assert_pda(
        "counter",
        ctx.accounts.counter,
        &crate::ID,
        &Metadata::seeds(ctx.accounts.authority.key),
    )?;
    assert_signer("authority", ctx.accounts.authority)?;
    assert_signer("payer", ctx.accounts.payer)?;
    assert_writable("payer", ctx.accounts.payer)?;
    assert_same_pubkeys(
        "system_program",
        ctx.accounts.system_program,
        &system_program::id(),
    )?;

    // Do nothing if the domain already exists.
    if !ctx.accounts.counter.data_is_empty() {
        return Ok(());
    }

    // Create Counter PDA.
    let counter = Metadata {
        discriminator: AccountDiscriminator::Counter,
        authority: *ctx.accounts.authority.key,
        value: 0,
    };
    let mut seeds = Metadata::seeds(ctx.accounts.authority.key);
    let bump = [counter_bump];
    seeds.push(&bump);
    create_account(
        ctx.accounts.counter,
        ctx.accounts.payer,
        ctx.accounts.system_program,
        Metadata::LEN,
        &crate::ID,
        Some(&[&seeds]),
    )?;

    counter.save(ctx.accounts.counter)
}
