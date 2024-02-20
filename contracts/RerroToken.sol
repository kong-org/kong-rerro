// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract RerroToken is ERC20, ERC2771Context, Ownable {
    using ECDSA for bytes32;

    bytes32 public merkleRoot;
    mapping(address => address) public chipIdOwner;
    mapping(address => bool) public seededChips;
    mapping(address => uint256) public seededChipAmounts;
    mapping(address => mapping(address => bool)) public scannerMinted;
    bool public claimOwnershipPaused = true;
    bool public mintPaused = true;

    // Initial token amounts for $RERRO Quest
    uint256 public tokenCap = 14997495 * 10**18;
    uint256 public defaultMintAmount = 1 * 10**18;
    uint256 public defaultClaimedMintAmount = 2 * 10**18;
    uint256 public chipIdOwnerMintAmount = 1 * 10**18;

    constructor(address trustedForwarder) ERC20("Rerro", "RERRO") ERC2771Context(trustedForwarder) {
        // _mint(account, amount);
    }

    function setTokenCap(uint256 _newCap) external onlyOwner {
        tokenCap = _newCap;
    }

    function bulkSeed(address[] calldata chipIds) external onlyOwner {
        for (uint256 i = 0; i < chipIds.length; i++) {
            address chipId = chipIds[i];
            seededChips[chipId] = true;
            seededChipAmounts[chipId] = defaultMintAmount;
        }
    }

    function setMintAmount(address chipId, uint256 mintAmount) external onlyOwner {
        seededChipAmounts[chipId] = mintAmount;
    }

    function bulkSetMintAmount(address[] calldata chipIds, uint256[] calldata mintAmounts) external onlyOwner {
        require(chipIds.length == mintAmounts.length, "Mismatched arrays length");

        for (uint256 i = 0; i < chipIds.length; i++) {
            seededChipAmounts[chipIds[i]] = mintAmounts[i];
        }
    }

    // Called from the chip and relayed via ERC2771; note a few things:
    // 1. the chip is the signer and thus the sign command works even on old chips
    // 2. the scanner doesnt need to sign any tx
    // 3. _msgSender() is the chip, not the scanner
    function claimOwnership(address owner) external {
        address chipId = _msgSender();

        require(!claimOwnershipPaused, "Claiming is currently disabled.");
        chipIdOwner[chipId] = owner;
        seededChipAmounts[chipId] = defaultClaimedMintAmount; // We set a higher mint amount for chips that have been claimed by someone
    }

    // Called from the chip and relayed via ERC2771; note a few things:
    // 1. the chip is the signer and thus the sign command works even on old chips
    // 2. the scanner doesnt need to sign any tx
    // 3. _msgSender() is the chip, not the scanner
    function mint(address scanner) external {
        address chipId = _msgSender();

        require(!mintPaused, "Seeding and minting are currently disabled.");
        require(seededChips[chipId], "Unknown chipId.");
        require(!scannerMinted[chipId][scanner], "Scanner has already minted this chipId.");

        uint256 scannerMintAmount = seededChipAmounts[chipId];
        require(totalSupply() + scannerMintAmount + chipIdOwnerMintAmount <= tokenCap, "Cannot mint, may exceed token cap");

        address chipOwner = chipIdOwner[chipId];
        scannerMinted[chipId][scanner] = true;

        // The owner cannot also be the scanner
        if (chipOwner != scanner) {
            _mint(scanner, scannerMintAmount);
            // Check to see if the chip has been claimed by someone
            if (chipOwner != address(0)) {
                _mint(chipIdOwner[chipId], chipIdOwnerMintAmount);
            }
        }
    }

    function setMintPausedState(bool _state) external onlyOwner {
        mintPaused = _state;
    }

    function setClaimOwnershipPausedState(bool _state) external onlyOwner {
        claimOwnershipPaused = _state;
    }

    function updateMerkleRoot(bytes32 newMerkleRoot) external onlyOwner {
        merkleRoot = newMerkleRoot;
    }

    function setChipIdOwnerMintAmount(uint256 _amount) external onlyOwner {
        chipIdOwnerMintAmount = _amount;
    }

    // Override _msgSender() and _msgData() to use ERC2771Context methods
    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    // Override _contextSuffixLength to specify which base class implementation to use
    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }
}