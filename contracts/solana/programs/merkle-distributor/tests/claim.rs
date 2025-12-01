use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use merkle_distributor::state::{ClaimStatus, Distributor, CLAIM_SEED, DISTRIBUTOR_SEED};
use serde::Deserialize;
use solana_account::Account;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_program_option::COption;
use solana_program_pack::Pack;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;
use spl_associated_token_account_interface::address::get_associated_token_address_with_program_id;
use spl_token_interface::state::{Account as TokenAccount, Mint};

const PROGRAM: &[u8] = include_bytes!("../../../target/deploy/merkle_distributor.so");
const DECIMALS: u8 = 6;

#[derive(Deserialize)]
struct Fixture {
    root: String,
    claims: Vec<FixtureClaim>,
}

#[derive(Deserialize)]
struct FixtureClaim {
    seed: u8,
    claimant: String,
    amount: u64,
    proof: Vec<String>,
}

fn fixture() -> Fixture {
    serde_json::from_str(include_str!("fixtures/merkle.json")).unwrap()
}

fn hash32(value: &str) -> [u8; 32] {
    hex::decode(value).unwrap().try_into().unwrap()
}

struct Env {
    svm: LiteSVM,
    authority: Keypair,
    fee_payer: Keypair,
    mint: Pubkey,
    distributor: Pubkey,
    vault: Pubkey,
}

impl Env {
    fn new(root: [u8; 32]) -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program(merkle_distributor::ID, PROGRAM).unwrap();

        let authority = Keypair::new();
        let fee_payer = Keypair::new();
        svm.airdrop(&authority.pubkey(), 10_000_000_000).unwrap();
        svm.airdrop(&fee_payer.pubkey(), 10_000_000_000).unwrap();

        let mint = Pubkey::new_unique();
        let mut data = vec![0; Mint::LEN];
        Mint::pack(
            Mint {
                mint_authority: COption::Some(authority.pubkey()),
                supply: 0,
                decimals: DECIMALS,
                is_initialized: true,
                freeze_authority: COption::None,
            },
            &mut data,
        )
        .unwrap();
        svm.set_account(
            mint,
            Account {
                lamports: svm.minimum_balance_for_rent_exemption(Mint::LEN),
                data,
                owner: spl_token_interface::ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();

        let (distributor, _) = Pubkey::find_program_address(
            &[DISTRIBUTOR_SEED, mint.as_ref(), authority.pubkey().as_ref()],
            &merkle_distributor::ID,
        );
        let vault = ata(&distributor, &mint);

        let mut env = Self {
            svm,
            authority,
            fee_payer,
            mint,
            distributor,
            vault,
        };
        env.initialize(root);
        env.mint_to_vault(1_000_000_000_000);
        env
    }

    fn initialize(&mut self, root: [u8; 32]) {
        let ix = Instruction {
            program_id: merkle_distributor::ID,
            accounts: merkle_distributor::accounts::Initialize {
                authority: self.authority.pubkey(),
                mint: self.mint,
                distributor: self.distributor,
                vault: self.vault,
                token_program: spl_token_interface::ID,
                associated_token_program: spl_associated_token_account_interface::program::ID,
                system_program: solana_system_interface::program::ID,
            }
            .to_account_metas(None),
            data: merkle_distributor::instruction::Initialize { root }.data(),
        };
        let authority = self.authority.insecure_clone();
        self.send(&[ix], &authority, &[&authority]).unwrap();
    }

    fn mint_to_vault(&mut self, amount: u64) {
        let ix = spl_token_interface::instruction::mint_to(
            &spl_token_interface::ID,
            &self.mint,
            &self.vault,
            &self.authority.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        let authority = self.authority.insecure_clone();
        self.send(&[ix], &authority, &[&authority]).unwrap();
    }

    fn claim_ix(&self, claimant: &Pubkey, amount: u64, proof: Vec<[u8; 32]>) -> Instruction {
        Instruction {
            program_id: merkle_distributor::ID,
            accounts: merkle_distributor::accounts::Claim {
                payer: self.fee_payer.pubkey(),
                claimant: *claimant,
                distributor: self.distributor,
                claim_status: claim_status_address(&self.distributor, claimant),
                mint: self.mint,
                vault: self.vault,
                claimant_token_account: ata(claimant, &self.mint),
                token_program: spl_token_interface::ID,
                associated_token_program: spl_associated_token_account_interface::program::ID,
                system_program: solana_system_interface::program::ID,
            }
            .to_account_metas(None),
            data: merkle_distributor::instruction::Claim {
                cumulative_amount: amount,
                proof,
            }
            .data(),
        }
    }

    /// Fee payer and rent come from the backend key, the claimant only signs.
    fn claim(
        &mut self,
        claimant: &Keypair,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<(), String> {
        let ix = self.claim_ix(&claimant.pubkey(), amount, proof);
        let fee_payer = self.fee_payer.insecure_clone();
        self.send(&[ix], &fee_payer, &[&fee_payer, claimant])
    }

    fn update_root(&mut self, signer: &Keypair, root: [u8; 32]) -> Result<(), String> {
        let ix = Instruction {
            program_id: merkle_distributor::ID,
            accounts: merkle_distributor::accounts::UpdateRoot {
                authority: signer.pubkey(),
                distributor: self.distributor,
            }
            .to_account_metas(None),
            data: merkle_distributor::instruction::UpdateRoot { root }.data(),
        };
        self.send(&[ix], signer, &[signer])
    }

    fn set_paused(&mut self, paused: bool) {
        let ix = Instruction {
            program_id: merkle_distributor::ID,
            accounts: merkle_distributor::accounts::UpdateRoot {
                authority: self.authority.pubkey(),
                distributor: self.distributor,
            }
            .to_account_metas(None),
            data: merkle_distributor::instruction::SetPaused { paused }.data(),
        };
        let authority = self.authority.insecure_clone();
        self.send(&[ix], &authority, &[&authority]).unwrap();
    }

    fn send(
        &mut self,
        ixs: &[Instruction],
        payer: &Keypair,
        signers: &[&Keypair],
    ) -> Result<(), String> {
        self.svm.expire_blockhash();
        let message = Message::new(ixs, Some(&payer.pubkey()));
        let tx = Transaction::new(signers, message, self.svm.latest_blockhash());
        self.svm
            .send_transaction(tx)
            .map(|_| ())
            .map_err(|failure| format!("{:?}\n{}", failure.err, failure.meta.logs.join("\n")))
    }

    fn token_balance(&self, owner: &Pubkey) -> u64 {
        let account = self.svm.get_account(&ata(owner, &self.mint)).unwrap();
        TokenAccount::unpack(&account.data).unwrap().amount
    }

    fn distributor_state(&self) -> Distributor {
        let account = self.svm.get_account(&self.distributor).unwrap();
        Distributor::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, &spl_token_interface::ID)
}

fn claim_status_address(distributor: &Pubkey, claimant: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[CLAIM_SEED, distributor.as_ref(), claimant.as_ref()],
        &merkle_distributor::ID,
    )
    .0
}

fn keypair(seed: u8) -> Keypair {
    Keypair::new_from_array([seed; 32])
}

fn proof_of(claim: &FixtureClaim) -> Vec<[u8; 32]> {
    claim.proof.iter().map(|node| hash32(node)).collect()
}

#[test]
fn every_claimant_from_the_backend_fixture_can_claim() {
    let fixture = fixture();
    let mut env = Env::new(hash32(&fixture.root));

    for claim in &fixture.claims {
        let claimant = keypair(claim.seed);
        assert_eq!(
            claimant.pubkey().to_string(),
            claim.claimant,
            "seed mismatch"
        );

        env.claim(&claimant, claim.amount, proof_of(claim)).unwrap();
        assert_eq!(env.token_balance(&claimant.pubkey()), claim.amount);
    }

    let state = env.distributor_state();
    let total: u64 = fixture.claims.iter().map(|claim| claim.amount).sum();
    assert_eq!(state.total_claimed, total);
    assert_eq!(state.claimants, fixture.claims.len() as u64);
}

#[test]
fn claimant_pays_nothing() {
    let fixture = fixture();
    let mut env = Env::new(hash32(&fixture.root));
    let claim = &fixture.claims[0];
    let claimant = keypair(claim.seed);

    env.claim(&claimant, claim.amount, proof_of(claim)).unwrap();
    assert!(env.svm.get_account(&claimant.pubkey()).is_none());
}

#[test]
fn second_claim_with_same_proof_fails() {
    let fixture = fixture();
    let mut env = Env::new(hash32(&fixture.root));
    let claim = &fixture.claims[1];
    let claimant = keypair(claim.seed);

    env.claim(&claimant, claim.amount, proof_of(claim)).unwrap();
    let err = env
        .claim(&claimant, claim.amount, proof_of(claim))
        .unwrap_err();
    assert!(err.contains("NothingToClaim"), "{err}");
}

#[test]
fn wrong_amount_or_foreign_proof_is_rejected() {
    let fixture = fixture();
    let mut env = Env::new(hash32(&fixture.root));
    let claim = &fixture.claims[2];
    let claimant = keypair(claim.seed);

    let err = env
        .claim(&claimant, claim.amount + 1, proof_of(claim))
        .unwrap_err();
    assert!(err.contains("InvalidProof"), "{err}");

    let other = &fixture.claims[3];
    let err = env
        .claim(&claimant, other.amount, proof_of(other))
        .unwrap_err();
    assert!(err.contains("InvalidProof"), "{err}");
}

#[test]
fn new_root_pays_only_the_top_up() {
    let claimant = Keypair::new();
    let leaf = |amount| merkle_distributor::merkle::leaf(&claimant.pubkey(), amount);

    let mut env = Env::new(leaf(2_000_000));
    env.claim(&claimant, 2_000_000, vec![]).unwrap();

    let authority = env.authority.insecure_clone();
    env.update_root(&authority, leaf(5_000_000)).unwrap();
    env.claim(&claimant, 5_000_000, vec![]).unwrap();

    assert_eq!(env.token_balance(&claimant.pubkey()), 5_000_000);
    let state = env.distributor_state();
    assert_eq!(state.version, 2);
    assert_eq!(state.claimants, 1);

    let status_account = env
        .svm
        .get_account(&claim_status_address(&env.distributor, &claimant.pubkey()))
        .unwrap();
    let status = ClaimStatus::try_deserialize(&mut status_account.data.as_slice()).unwrap();
    assert_eq!(status.claimed, 5_000_000);
}

#[test]
fn only_authority_updates_root() {
    let fixture = fixture();
    let mut env = Env::new(hash32(&fixture.root));
    let intruder = Keypair::new();
    env.svm.airdrop(&intruder.pubkey(), 1_000_000_000).unwrap();

    let err = env.update_root(&intruder, [7; 32]).unwrap_err();
    assert!(err.contains("ConstraintHasOne"), "{err}");
}

#[test]
fn paused_distributor_rejects_claims() {
    let fixture = fixture();
    let mut env = Env::new(hash32(&fixture.root));
    let claim = &fixture.claims[0];
    let claimant = keypair(claim.seed);

    env.set_paused(true);
    let err = env
        .claim(&claimant, claim.amount, proof_of(claim))
        .unwrap_err();
    assert!(err.contains("Paused"), "{err}");

    env.set_paused(false);
    env.claim(&claimant, claim.amount, proof_of(claim)).unwrap();
}
