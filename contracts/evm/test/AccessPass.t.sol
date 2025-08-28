// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AccessPass} from "../src/AccessPass.sol";

contract AccessPassTest is Test {
    AccessPass internal pass;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        pass = new AccessPass(owner);
    }

    function test_SelfMint() public {
        vm.prank(alice);
        uint256 id = pass.mint();

        assertEq(id, 1);
        assertEq(pass.ownerOf(1), alice);
        assertTrue(pass.hasMinted(alice));
    }

    function test_OwnerMintsOnBehalfOfUser() public {
        vm.prank(owner);
        pass.mintTo(alice);
        assertEq(pass.balanceOf(alice), 1);
    }

    function test_RevertWhen_SecondMintForSameAddress() public {
        vm.prank(owner);
        pass.mintTo(alice);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AccessPass.AlreadyMinted.selector, alice));
        pass.mint();
    }

    function test_RevertWhen_StrangerUsesMintTo() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pass.mintTo(alice);
    }

    function test_TokenUriIsOnChainJson() public {
        vm.prank(alice);
        pass.mint();

        string memory uri = pass.tokenURI(1);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");
    }

    function test_SupplyCountsMints() public {
        vm.prank(alice);
        pass.mint();
        vm.prank(owner);
        pass.mintTo(makeAddr("bob"));
        assertEq(pass.totalMinted(), 2);
    }

    function _prefix(string memory value, uint256 length) private pure returns (string memory) {
        bytes memory out = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            out[i] = bytes(value)[i];
        }
        return string(out);
    }
}
