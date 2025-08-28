// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MeridianToken} from "../src/MeridianToken.sol";
import {MerkleDistributor} from "../src/MerkleDistributor.sol";
import {MerkleBuilder} from "./utils/MerkleBuilder.sol";

contract MerkleDistributorTest is Test {
    MeridianToken internal token;
    MerkleDistributor internal distributor;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal relayer = makeAddr("relayer");

    bytes32[] internal leaves;

    function setUp() public {
        token = new MeridianToken(address(this), 1_000_000 ether);
        leaves.push(MerkleBuilder.leaf(alice, 100 ether));
        leaves.push(MerkleBuilder.leaf(bob, 250 ether));
        leaves.push(MerkleBuilder.leaf(carol, 40 ether));

        distributor = new MerkleDistributor(token, owner, MerkleBuilder.root(leaves));
        token.transfer(address(distributor), 10_000 ether);
    }

    function test_ClaimTransfersFullAllocation() public {
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 1);

        vm.expectEmit(address(distributor));
        emit MerkleDistributor.Claimed(bob, 250 ether, 250 ether);
        distributor.claim(bob, 250 ether, proof);

        assertEq(token.balanceOf(bob), 250 ether);
        assertEq(distributor.claimed(bob), 250 ether);
    }

    function test_RelayerCanClaimButTokensGoToAccount() public {
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 0);

        vm.prank(relayer);
        distributor.claim(alice, 100 ether, proof);

        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.balanceOf(relayer), 0);
    }

    function test_RevertWhen_ClaimingTwice() public {
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 0);
        distributor.claim(alice, 100 ether, proof);

        vm.expectRevert(MerkleDistributor.NothingToClaim.selector);
        distributor.claim(alice, 100 ether, proof);
    }

    function test_RevertWhen_AmountDoesNotMatchLeaf() public {
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 0);

        vm.expectRevert(MerkleDistributor.InvalidProof.selector);
        distributor.claim(alice, 101 ether, proof);
    }

    function test_RevertWhen_ProofBelongsToAnotherAccount() public {
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 1);

        vm.expectRevert(MerkleDistributor.InvalidProof.selector);
        distributor.claim(alice, 250 ether, proof);
    }

    function test_NewRootPaysOnlyTheTopUp() public {
        distributor.claim(alice, 100 ether, MerkleBuilder.proof(leaves, 0));

        leaves[0] = MerkleBuilder.leaf(alice, 160 ether);
        vm.prank(owner);
        distributor.setMerkleRoot(MerkleBuilder.root(leaves));

        uint256 paid = distributor.claim(alice, 160 ether, MerkleBuilder.proof(leaves, 0));
        assertEq(paid, 60 ether);
        assertEq(token.balanceOf(alice), 160 ether);
    }

    function test_OldProofStopsWorkingAfterRootChange() public {
        bytes32[] memory oldProof = MerkleBuilder.proof(leaves, 2);
        leaves[2] = MerkleBuilder.leaf(carol, 80 ether);
        vm.prank(owner);
        distributor.setMerkleRoot(MerkleBuilder.root(leaves));

        vm.expectRevert(MerkleDistributor.InvalidProof.selector);
        distributor.claim(carol, 40 ether, oldProof);
    }

    function test_ClaimableReportsRemainingAmount() public {
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 1);
        assertEq(distributor.claimable(bob, 250 ether, proof), 250 ether);

        distributor.claim(bob, 250 ether, proof);
        assertEq(distributor.claimable(bob, 250 ether, proof), 0);
        assertEq(distributor.claimable(bob, 999 ether, proof), 0);
    }

    function test_RevertWhen_Paused() public {
        vm.prank(owner);
        distributor.pause();

        bytes32[] memory proof = MerkleBuilder.proof(leaves, 0);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        distributor.claim(alice, 100 ether, proof);

        vm.prank(owner);
        distributor.unpause();
        distributor.claim(alice, 100 ether, proof);
    }

    function test_RevertWhen_NonOwnerManages() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        distributor.setMerkleRoot(bytes32(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        distributor.sweep(alice, 1 ether);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        distributor.pause();
        vm.stopPrank();
    }

    function test_SweepReturnsUnclaimedTokens() public {
        vm.prank(owner);
        distributor.sweep(owner, 9000 ether);
        assertEq(token.balanceOf(owner), 9000 ether);
        assertEq(token.balanceOf(address(distributor)), 1000 ether);
    }

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        distributor.transferOwnership(alice);
        assertEq(distributor.owner(), owner);

        vm.prank(alice);
        distributor.acceptOwnership();
        assertEq(distributor.owner(), alice);
    }

    function testFuzz_ClaimFromRandomTree(
        address[8] memory accounts,
        uint96[8] memory amounts,
        uint8 pick
    ) public {
        bytes32[] memory fuzzLeaves = new bytes32[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) {
            vm.assume(accounts[i] != address(0) && accounts[i] != address(distributor));
            vm.assume(amounts[i] > 0);
            for (uint256 j = 0; j < i; j++) {
                vm.assume(accounts[i] != accounts[j]);
            }
            fuzzLeaves[i] = MerkleBuilder.leaf(accounts[i], amounts[i]);
        }
        uint256 index = pick % accounts.length;
        address account = accounts[index];

        MerkleDistributor fuzzDistributor =
            new MerkleDistributor(token, owner, MerkleBuilder.root(fuzzLeaves));
        deal(address(token), address(fuzzDistributor), amounts[index]);

        uint256 before = token.balanceOf(account);
        fuzzDistributor.claim(account, amounts[index], MerkleBuilder.proof(fuzzLeaves, index));
        assertEq(token.balanceOf(account) - before, amounts[index]);

        vm.expectRevert(MerkleDistributor.NothingToClaim.selector);
        fuzzDistributor.claim(account, amounts[index], MerkleBuilder.proof(fuzzLeaves, index));
    }

    function testFuzz_RevertWhen_WrongAmount(uint96 wrongAmount) public {
        vm.assume(wrongAmount != 100 ether);
        bytes32[] memory proof = MerkleBuilder.proof(leaves, 0);

        vm.expectRevert(MerkleDistributor.InvalidProof.selector);
        distributor.claim(alice, wrongAmount, proof);
    }
}
