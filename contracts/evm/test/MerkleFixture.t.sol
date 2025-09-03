// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MeridianToken} from "../src/MeridianToken.sol";
import {MerkleDistributor} from "../src/MerkleDistributor.sol";

// Proofs in the fixture come from @openzeppelin/merkle-tree via packages/core, the same code the
// backend uses. Regenerate with `npm run fixtures -w @mcg/core`.
contract MerkleFixtureTest is Test {
    function test_BackendProofsClaimOnChain() public {
        string memory json = vm.readFile("test/fixtures/merkle.json");
        bytes32 root = vm.parseJsonBytes32(json, ".root");

        MeridianToken token = new MeridianToken(address(this), 1_000_000 ether);
        MerkleDistributor distributor = new MerkleDistributor(token, address(this), root);
        token.transfer(address(distributor), 1_000_000 ether);

        uint256 count;
        while (vm.keyExistsJson(json, _path(count, "account"))) {
            address account = vm.parseJsonAddress(json, _path(count, "account"));
            uint256 amount = vm.parseJsonUint(json, _path(count, "amount"));
            bytes32[] memory proof = vm.parseJsonBytes32Array(json, _path(count, "proof"));

            distributor.claim(account, amount, proof);
            assertEq(token.balanceOf(account), amount);
            count++;
        }
        assertGt(count, 0);
    }

    function _path(uint256 index, string memory field) private pure returns (string memory) {
        return string.concat(".claims[", vm.toString(index), "].", field);
    }
}
