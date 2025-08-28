// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// Fixed-supply token used for the demo airdrop. Everything is minted once at deploy time.
contract MeridianToken is ERC20, ERC20Permit {
    constructor(address treasury, uint256 supply) ERC20("Meridian", "MRD") ERC20Permit("Meridian") {
        _mint(treasury, supply);
    }
}
