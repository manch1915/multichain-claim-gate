// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {MeridianToken} from "../src/MeridianToken.sol";
import {MerkleDistributor} from "../src/MerkleDistributor.sol";
import {AccessPass} from "../src/AccessPass.sol";

/// forge script script/Deploy.s.sol --rpc-url sepolia --private-key $DEPLOYER_PRIVATE_KEY --broadcast
///
/// SPONSOR_ADDRESS becomes the owner of the distributor and the pass, so the backend can publish
/// roots and mint passes through sponsored user operations.
contract Deploy is Script {
    uint256 internal constant SUPPLY = 100_000_000 ether;
    uint256 internal constant AIRDROP_POOL = 10_000_000 ether;

    function run() external {
        address sponsor = vm.envAddress("SPONSOR_ADDRESS");
        bytes32 initialRoot = vm.envOr("INITIAL_ROOT", bytes32(0));

        vm.startBroadcast();
        address deployer = msg.sender;
        MeridianToken token = new MeridianToken(deployer, SUPPLY);
        MerkleDistributor distributor = new MerkleDistributor(token, sponsor, initialRoot);
        AccessPass pass = new AccessPass(sponsor);
        token.transfer(address(distributor), AIRDROP_POOL);
        token.transfer(sponsor, SUPPLY - AIRDROP_POOL);
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeAddress(key, "token", address(token));
        vm.serializeAddress(key, "distributor", address(distributor));
        vm.serializeAddress(key, "sponsor", sponsor);
        string memory json = vm.serializeAddress(key, "accessPass", address(pass));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));

        console2.log("token", address(token));
        console2.log("distributor", address(distributor));
        console2.log("accessPass", address(pass));
    }
}
