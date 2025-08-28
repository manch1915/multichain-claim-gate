// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// Membership pass for the gated area. One pass per address, metadata rendered on-chain.
///
/// Anyone can mint their own pass and pay gas, or the owner (the sponsor account) can mint on a
/// user's behalf so the user pays nothing.
contract AccessPass is ERC721, Ownable {
    using Strings for uint256;

    uint256 public totalMinted;
    mapping(address account => bool) public hasMinted;

    error AlreadyMinted(address account);

    constructor(address owner_) ERC721("Meridian Pass", "MPASS") Ownable(owner_) {}

    function mint() external returns (uint256) {
        return _mintOnce(msg.sender);
    }

    function mintTo(address to) external onlyOwner returns (uint256) {
        return _mintOnce(to);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory id = tokenId.toString();
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" rx="32" fill="#0E0F11"/>',
            '<rect x="24" y="24" width="352" height="352" rx="20" fill="none" stroke="#2A2E35"/>',
            '<circle cx="200" cy="170" r="64" fill="none" stroke="#D4FF3A" stroke-width="10"/>',
            '<text x="200" y="300" fill="#F6F5F1" font-family="monospace" font-size="28" ',
            'text-anchor="middle">MERIDIAN PASS</text>',
            '<text x="200" y="340" fill="#8A92B2" font-family="monospace" font-size="20" ',
            'text-anchor="middle">#',
            id,
            "</text></svg>"
        );
        bytes memory json = abi.encodePacked(
            '{"name":"Meridian Pass #',
            id,
            '","description":"Grants access to the Meridian holders lounge.","image":"data:image/svg+xml;base64,',
            Base64.encode(svg),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    function _mintOnce(address to) private returns (uint256 tokenId) {
        if (hasMinted[to]) revert AlreadyMinted(to);
        hasMinted[to] = true;
        tokenId = ++totalMinted;
        _safeMint(to, tokenId);
    }
}
