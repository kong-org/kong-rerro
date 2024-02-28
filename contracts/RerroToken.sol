// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
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
    uint256 public defaultMintAmount = 250 * 10**18;
    uint256 public defaultClaimedMintAmount = 500 * 10**18;
    uint256 public chipIdOwnerMintAmount = 25 * 10**18;

    // The key which is used to sign the chipId
    address public arxCertSigner;

    // Updated constructor to accept arxCertSigner
    constructor(address trustedForwarder, address _arxCertSigner) 
        ERC20("KONG Land Rerro", "RERRO") 
        ERC2771Context(trustedForwarder) 
    {
        arxCertSigner = _arxCertSigner;

        // Mint some to the KONG Land treasury
        _mint(0x8e683d27A31a0a085A7b4D433a21EEc3ec3CFAb7, 1499749 * 10**18);
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

    function bulkClaim(address[] calldata chipIds, uint256[] calldata mintAmounts, address[] calldata owners) external onlyOwner {
        require(chipIds.length == owners.length, "Mismatched owners arrays length");
        require(chipIds.length == mintAmounts.length, "Mismatched mintAmount arrays length");

        for (uint256 i = 0; i < chipIds.length; i++) {
            address chipId = chipIds[i];
            address owner = owners[i];

            require(chipIdOwner[chipId] == address(0), "Ownership already claimed for one or more chips.");

            seededChips[chipIds[i]] = true;

             // Note: in the bulk claim scenario we do not mint $RERRO to the chip owner
            chipIdOwner[chipId] = owner;
            seededChipAmounts[chipId] = mintAmounts[i];
        }
    }

    function setMintAmount(address chipId, uint256 mintAmount) external onlyOwner {
        seededChipAmounts[chipId] = mintAmount;
    }

    function bulkSetMintAmount(address[] calldata chipIds, uint256[] calldata mintAmounts) external onlyOwner {
        require(chipIds.length == mintAmounts.length, "Mismatched arrays length");

        for (uint256 i = 0; i < chipIds.length; i++) {
            seededChips[chipIds[i]] = true; // Seed the chip if it hasn't been seeded
            seededChipAmounts[chipIds[i]] = mintAmounts[i];
        }
    }
    
    function verifySignature(address chipId, bytes memory signature) public view returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(chipId));
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();

        return ethSignedMessageHash.recover(signature) == arxCertSigner;
    }

    // Called from the chip and relayed via ERC2771; note a few things:
    // 1. the chip is the signer and thus the sign command works even on old chips
    // 2. the scanner doesnt need to sign any tx
    // 3. _msgSender() is the chip, not the scanner

    // ClaimOwnership with signature verification
    function claimOwnershipWithSignature(address owner, bytes calldata signature) external {
        address chipId = _msgSender();
        require(verifySignature(chipId, signature), "Invalid signature");
        seededChips[chipId] = true; // Ensure the chip is marked as seeded if it wasn't already
        claimOwnershipInternal(chipId, owner);
    }

    // ClaimOwnership without signature, with seeding check
    function claimOwnership(address owner) external {
        address chipId = _msgSender();
        require(seededChips[chipId], "Chip is not seeded; ownership claim not allowed.");
        claimOwnershipInternal(chipId, owner);
    }

    // Internal function to handle common claimOwnership logic
    function claimOwnershipInternal(address chipId, address owner) internal {
        require(!claimOwnershipPaused, "Claiming is currently disabled.");
        require(chipIdOwner[chipId] == address(0), "Ownership already claimed.");
        chipIdOwner[chipId] = owner;
        seededChipAmounts[chipId] = defaultClaimedMintAmount; // Set a higher mint amount for chips that have been claimed

        // Upon claim, the chip owner gets some $RERRO as well
        require(totalSupply() + defaultClaimedMintAmount <= tokenCap, "Cannot mint, may exceed token cap");
        _mint(owner, defaultClaimedMintAmount);
    }

    // Called from the chip and relayed via ERC2771; note a few things:
    // 1. the chip is the signer and thus the sign command works even on old chips
    // 2. the scanner doesnt need to sign any tx
    // 3. _msgSender() is the chip, not the scanner

    // Mint function without signature, reverting if chip is not seeded
    function mint(address scanner) external {
        address chipId = _msgSender();  
        require(seededChips[chipId], "Chip is not seeded; minting not allowed.");
        mintInternal(scanner, chipId);
    }
    
    // Mint function with signature verification
    function mintWithSignature(address scanner, bytes calldata signature) external {
        address chipId = _msgSender();
        require(verifySignature(chipId, signature), "Invalid signature");

        // If the chip isn't seeded, seed it and set the default mint amount
        if (!seededChips[chipId]) {
            seededChips[chipId] = true;
            seededChipAmounts[chipId] = defaultMintAmount;
        }

        mintInternal(scanner, chipId);
    }

    // Internal function to handle common minting logic
    function mintInternal(address scanner, address chipId) internal {
        require(!mintPaused, "Seeding and minting are currently disabled.");
        require(!scannerMinted[chipId][scanner], "Scanner has already minted this chipId.");

        uint256 scannerMintAmount = seededChipAmounts[chipId];
        require(totalSupply() + scannerMintAmount + chipIdOwnerMintAmount <= tokenCap, "Cannot mint, may exceed token cap");

        address chipOwner = chipIdOwner[chipId];
        scannerMinted[chipId][scanner] = true;

        // The owner cannot also be the scanner
        if (chipOwner != scanner) {
            _mint(scanner, scannerMintAmount);
            // If the chip has been claimed by someone
            if (chipOwner != address(0)) {
                _mint(chipIdOwner[chipId], chipIdOwnerMintAmount);
            }
        }
    }

    function setArxCertSigner(address _newSigner) external onlyOwner {
        arxCertSigner = _newSigner;
    }

    function setMintPausedState(bool _state) external onlyOwner {
        mintPaused = _state;
    }

    function setClaimOwnershipPausedState(bool _state) external onlyOwner {
        claimOwnershipPaused = _state;
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