use anchor_lang::prelude::*;

#[error_code]
pub enum DistributorError {
    #[msg("Merkle proof does not match the current root")]
    InvalidProof,
    #[msg("Nothing left to claim for this account")]
    NothingToClaim,
    #[msg("Claims are paused")]
    Paused,
    #[msg("Proof is too long")]
    ProofTooLong,
    #[msg("Arithmetic overflow")]
    Overflow,
}
