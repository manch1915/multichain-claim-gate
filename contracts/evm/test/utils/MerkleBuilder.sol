// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Hashes} from "@openzeppelin/contracts/utils/cryptography/Hashes.sol";

/// Minimal sorted-pair Merkle tree for tests. Odd nodes are carried up unchanged.
library MerkleBuilder {
    function leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function root(bytes32[] memory leaves) internal pure returns (bytes32) {
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            level = _next(level);
        }
        return level[0];
    }

    function proof(bytes32[] memory leaves, uint256 index)
        internal
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory path = new bytes32[](_depth(leaves.length));
        uint256 size;
        bytes32[] memory level = leaves;
        while (level.length > 1) {
            uint256 sibling = index ^ 1;
            if (sibling < level.length) {
                path[size++] = level[sibling];
            }
            level = _next(level);
            index /= 2;
        }
        assembly {
            mstore(path, size)
        }
        return path;
    }

    function _next(bytes32[] memory level) private pure returns (bytes32[] memory up) {
        up = new bytes32[]((level.length + 1) / 2);
        for (uint256 i = 0; i < up.length; i++) {
            uint256 left = i * 2;
            up[i] = left + 1 < level.length
                ? Hashes.commutativeKeccak256(level[left], level[left + 1])
                : level[left];
        }
    }

    function _depth(uint256 n) private pure returns (uint256 d) {
        while (n > 1) {
            n = (n + 1) / 2;
            d++;
        }
    }
}
