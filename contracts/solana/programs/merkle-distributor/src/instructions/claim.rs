use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::error::DistributorError;
use crate::merkle;
use crate::state::{ClaimStatus, Claimed, Distributor, CLAIM_SEED, DISTRIBUTOR_SEED};

const MAX_PROOF_LEN: usize = 32;

#[derive(Accounts)]
pub struct Claim<'info> {
    /// Pays the fee and the rent. In the demo this is the backend's fee payer.
    #[account(mut)]
    pub payer: Signer<'info>,

    pub claimant: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub distributor: Account<'info, Distributor>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + ClaimStatus::INIT_SPACE,
        seeds = [CLAIM_SEED, distributor.key().as_ref(), claimant.key().as_ref()],
        bump,
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = claimant,
        associated_token::token_program = token_program,
    )]
    pub claimant_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Claim>, cumulative_amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
    let claimant = ctx.accounts.claimant.key();
    let distributor = &ctx.accounts.distributor;

    require!(!distributor.paused, DistributorError::Paused);
    require!(proof.len() <= MAX_PROOF_LEN, DistributorError::ProofTooLong);
    require!(
        merkle::verify(
            &proof,
            &distributor.root,
            merkle::leaf(&claimant, cumulative_amount)
        ),
        DistributorError::InvalidProof
    );

    let status = &mut ctx.accounts.claim_status;
    let first_claim = status.claimant == Pubkey::default();
    if first_claim {
        status.claimant = claimant;
        status.bump = ctx.bumps.claim_status;
    }
    require!(
        cumulative_amount > status.claimed,
        DistributorError::NothingToClaim
    );
    let amount = cumulative_amount - status.claimed;
    status.claimed = cumulative_amount;

    let mint_key = distributor.mint;
    let authority_key = distributor.authority;
    let bump = distributor.bump;
    let seeds: &[&[&[u8]]] = &[&[
        DISTRIBUTOR_SEED,
        mint_key.as_ref(),
        authority_key.as_ref(),
        &[bump],
    ]];
    let accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.claimant_token_account.to_account_info(),
        authority: ctx.accounts.distributor.to_account_info(),
    };
    let cpi = CpiContext::new_with_signer(ctx.accounts.token_program.key(), accounts, seeds);
    token_interface::transfer_checked(cpi, amount, ctx.accounts.mint.decimals)?;

    let distributor = &mut ctx.accounts.distributor;
    distributor.total_claimed = distributor
        .total_claimed
        .checked_add(amount)
        .ok_or(DistributorError::Overflow)?;
    if first_claim {
        distributor.claimants = distributor
            .claimants
            .checked_add(1)
            .ok_or(DistributorError::Overflow)?;
    }

    emit!(Claimed {
        distributor: distributor.key(),
        claimant,
        amount,
        cumulative_amount,
    });
    Ok(())
}
