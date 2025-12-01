use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::{Distributor, RootUpdated, DISTRIBUTOR_SEED};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    // The authority is part of the seeds, so nobody can squat the distributor address for a mint.
    #[account(
        init,
        payer = authority,
        space = 8 + Distributor::INIT_SPACE,
        seeds = [DISTRIBUTOR_SEED, mint.key().as_ref(), authority.key().as_ref()],
        bump,
    )]
    pub distributor: Account<'info, Distributor>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = distributor,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, root: [u8; 32]) -> Result<()> {
    let distributor = &mut ctx.accounts.distributor;
    distributor.authority = ctx.accounts.authority.key();
    distributor.mint = ctx.accounts.mint.key();
    distributor.vault = ctx.accounts.vault.key();
    distributor.root = root;
    distributor.version = 1;
    distributor.total_claimed = 0;
    distributor.claimants = 0;
    distributor.paused = false;
    distributor.bump = ctx.bumps.distributor;

    emit!(RootUpdated {
        distributor: distributor.key(),
        root,
        version: distributor.version,
    });
    Ok(())
}
