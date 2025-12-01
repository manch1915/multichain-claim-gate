use anchor_lang::prelude::Pubkey;
use solana_sha256_hasher::hashv;

// Must stay in sync with packages/core/src/merkle/solana.ts.
const LEAF_PREFIX: &[u8] = &[0];
const NODE_PREFIX: &[u8] = &[1];

pub fn leaf(claimant: &Pubkey, amount: u64) -> [u8; 32] {
    hashv(&[LEAF_PREFIX, claimant.as_ref(), &amount.to_le_bytes()]).to_bytes()
}

pub fn node(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let (first, second) = if a <= b { (a, b) } else { (b, a) };
    hashv(&[NODE_PREFIX, first, second]).to_bytes()
}

pub fn verify(proof: &[[u8; 32]], root: &[u8; 32], leaf: [u8; 32]) -> bool {
    let computed = proof
        .iter()
        .fold(leaf, |hash, sibling| node(&hash, sibling));
    &computed == root
}
