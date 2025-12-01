use anchor_lang::prelude::*;

pub const DISTRIBUTOR_SEED: &[u8] = b"distributor";
pub const CLAIM_SEED: &[u8] = b"claim";

#[account]
#[derive(InitSpace)]
pub struct Distributor {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub root: [u8; 32],
    /// Bumped on every root update so clients can tell which snapshot is live.
    pub version: u64,
    pub total_claimed: u64,
    pub claimants: u64,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimStatus {
    pub claimant: Pubkey,
    /// Cumulative amount paid out so far.
    pub claimed: u64,
    pub bump: u8,
}

#[event]
pub struct Claimed {
    pub distributor: Pubkey,
    pub claimant: Pubkey,
    pub amount: u64,
    pub cumulative_amount: u64,
}

#[event]
pub struct RootUpdated {
    pub distributor: Pubkey,
    pub root: [u8; 32],
    pub version: u64,
}
