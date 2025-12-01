use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod merkle;
pub mod state;

use instructions::*;

declare_id!("75kikp9KzBBAoefQopScXtnT4NpLJ54ZbRTSAAduPvdb");

#[program]
pub mod merkle_distributor {
    use super::*;

    /// Creates a distributor for `mint` with a vault owned by the distributor PDA.
    pub fn initialize(ctx: Context<Initialize>, root: [u8; 32]) -> Result<()> {
        instructions::initialize::handler(ctx, root)
    }

    pub fn update_root(ctx: Context<UpdateRoot>, root: [u8; 32]) -> Result<()> {
        instructions::admin::update_root(ctx, root)
    }

    pub fn set_paused(ctx: Context<UpdateRoot>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::admin::withdraw(ctx, amount)
    }

    /// Pays out `cumulative_amount` minus what the claimant already took. `payer` covers rent for
    /// the claim record and the token account, so a backend can sponsor the whole transaction.
    pub fn claim(ctx: Context<Claim>, cumulative_amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        instructions::claim::handler(ctx, cumulative_amount, proof)
    }
}
