// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// Cumulative Merkle airdrop.
///
/// Leaves carry the total amount an account is entitled to so far, so the owner can publish a new
/// root whenever the whitelist grows or an allocation is raised. An account only ever receives the
/// difference between its latest cumulative amount and what it already took.
///
/// Leaf encoding matches OpenZeppelin's StandardMerkleTree for ["address", "uint256"].
///
/// `claim` is permissionless on purpose: tokens can only go to `account`, which lets a relayer or
/// a sponsored user operation submit the claim on the user's behalf.
contract MerkleDistributor is Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public merkleRoot;
    mapping(address account => uint256 amount) public claimed;

    event Claimed(address indexed account, uint256 amount, uint256 cumulativeAmount);
    event MerkleRootUpdated(bytes32 indexed previousRoot, bytes32 indexed newRoot);
    event Swept(address indexed to, uint256 amount);

    error InvalidProof();
    error NothingToClaim();
    error ZeroAddress();

    constructor(IERC20 token_, address owner_, bytes32 root_) Ownable(owner_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
        merkleRoot = root_;
        emit MerkleRootUpdated(bytes32(0), root_);
    }

    function claim(address account, uint256 cumulativeAmount, bytes32[] calldata proof)
        external
        whenNotPaused
        returns (uint256 amount)
    {
        if (!verify(account, cumulativeAmount, proof)) revert InvalidProof();

        uint256 alreadyClaimed = claimed[account];
        if (cumulativeAmount <= alreadyClaimed) revert NothingToClaim();

        amount = cumulativeAmount - alreadyClaimed;
        claimed[account] = cumulativeAmount;
        token.safeTransfer(account, amount);

        emit Claimed(account, amount, cumulativeAmount);
    }

    function verify(address account, uint256 cumulativeAmount, bytes32[] calldata proof)
        public
        view
        returns (bool)
    {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, cumulativeAmount))));
        return MerkleProof.verifyCalldata(proof, merkleRoot, leaf);
    }

    function claimable(address account, uint256 cumulativeAmount, bytes32[] calldata proof)
        external
        view
        returns (uint256)
    {
        if (!verify(account, cumulativeAmount, proof)) return 0;
        uint256 alreadyClaimed = claimed[account];
        return cumulativeAmount > alreadyClaimed ? cumulativeAmount - alreadyClaimed : 0;
    }

    function setMerkleRoot(bytes32 newRoot) external onlyOwner {
        emit MerkleRootUpdated(merkleRoot, newRoot);
        merkleRoot = newRoot;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// Pulls unclaimed tokens back, e.g. when a campaign is closed.
    function sweep(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
        emit Swept(to, amount);
    }
}
