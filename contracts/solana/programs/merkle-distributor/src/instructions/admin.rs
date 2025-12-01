use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::error::DistributorError;
use crate::state::{Distributor, RootUpdated, DISTRIBUTOR_SEED};

#[derive(Accounts)]
pub struct UpdateRoot<'info> {
    pub authority: Signer<'info>,

    #[account(mut, has_one = authority)]
    pub distributor: Account<'info, Distributor>,
}

pub fn update_root(ctx: Context<UpdateRoot>, root: [u8; 32]) -> Result<()> {
    let distributor = &mut ctx.accounts.distributor;
    distributor.root = root;
    distributor.version = distributor
        .version
        .checked_add(1)
        .ok_or(DistributorError::Overflow)?;

    emit!(RootUpdated {
        distributor: distributor.key(),
        root,
        version: distributor.version,
    });
    Ok(())
}

pub fn set_paused(ctx: Context<UpdateRoot>, paused: bool) -> Result<()> {
    ctx.accounts.distributor.paused = paused;
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub authority: Signer<'info>,

    #[account(has_one = authority, has_one = mint, has_one = vault)]
    pub distributor: Account<'info, Distributor>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(mut, token::mint = mint, token::token_program = token_program)]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let distributor = &ctx.accounts.distributor;
    let mint_key = distributor.mint;
    let authority_key = distributor.authority;
    let seeds: &[&[&[u8]]] = &[&[
        DISTRIBUTOR_SEED,
        mint_key.as_ref(),
        authority_key.as_ref(),
        &[distributor.bump],
    ]];

    let accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.distributor.to_account_info(),
    };
    let cpi = CpiContext::new_with_signer(ctx.accounts.token_program.key(), accounts, seeds);
    token_interface::transfer_checked(cpi, amount, ctx.accounts.mint.decimals)
}
