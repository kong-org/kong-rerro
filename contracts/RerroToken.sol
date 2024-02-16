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
    mapping(address => bool) public seededAddresses;
    mapping(address => mapping(address => bool)) public scannerMinted;
    bool public paused = true;

    // Initial token amounts for $RERRO Quest
    uint256 public tokenCap = 14997495 * 10**18;
    uint256 public scannerMintAmountAny = 1 * 10**18;
    uint256 public scannerMintAmountSeeded = 1 * 10**18;
    uint256 public chipIdOwnerMintAmount = 1 * 10**18;


    constructor(address trustedForwarder) ERC20("Rerro", "RERRO") ERC2771Context(trustedForwarder) {
        // _mint(account, amount);
    }

    function setTokenCap(uint256 _newCap) external onlyOwner {
        tokenCap = _newCap;
    }

    function seedAddress(bytes32[] calldata merkleProof, address chipId) external {
        require(!paused, "Seeding and minting are currently disabled.");
        bytes32 leaf = keccak256(abi.encodePacked(chipId));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid proof.");
        require(!seededAddresses[chipId], "Address already seeded.");
        
        seededAddresses[chipId] = true;
        chipIdOwner[chipId] = _msgSender();
    }

    function mint(address chipId, uint256 blockNumber, bytes calldata signature) external {
        require(!paused, "Seeding and minting are currently disabled.");
        require(seededAddresses[chipId], "Chip not seeded.");
        require(blockNumber > block.number - 1000 && blockNumber <= block.number, "Block number out of range.");
        console.log(blockNumber);
        require(!scannerMinted[chipId][_msgSender()], "Scanner has already minted for this chipId.");
        require(totalSupply() + scannerMintAmountSeeded + chipIdOwnerMintAmount <= tokenCap, "Cannot mint, may exceed token cap");

        bytes32 blockHash = blockhash(blockNumber);
        address scanner = msg.sender;
        bytes32 messageHash = ECDSA.toEthSignedMessageHash(abi.encodePacked(scanner, blockHash));
        console.logBytes32(messageHash);
        address recoveredAddress = messageHash.recover(signature);
        console.logAddress(recoveredAddress);
        require(recoveredAddress == chipId, "Invalid signature.");

        scannerMinted[chipId][_msgSender()] = true;

        if (chipIdOwner[chipId] != _msgSender()) {
            _mint(_msgSender(), scannerMintAmountSeeded); // Use the modifiable mint amount for the scanner
            _mint(chipIdOwner[chipId], chipIdOwnerMintAmount); // Use the modifiable mint amount for the chipId owner
        } else {
            // If the scanner is also the chipId owner, mint only once using the scannerMintAmount or chipIdOwnerMintAmount
            _mint(_msgSender(), scannerMintAmountSeeded); // Or chipIdOwnerMintAmount, depending on your preference
        }
    }

    // TODO: mint with merkleProof but without seeding

    function seedChipIdWithCustomMint(address chipId, uint256 mintAmount, bytes32[] calldata merkleProof) external onlyOwner {
        require(!paused, "Seeding and minting are currently disabled.");
        bytes32 leaf = keccak256(abi.encodePacked(chipId));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid proof.");
        require(!seededAddresses[chipId], "Chip already seeded.");
        require(totalSupply() + mintAmount <= tokenCap, "Exceeds token cap");

        seededAddresses[chipId] = true;
        chipIdOwner[chipId] = msg.sender;
        _mint(chipIdOwner[chipId], mintAmount);
    }

    function setPausedState(bool _state) external onlyOwner {
        paused = _state;
    }

    function updateMerkleRoot(bytes32 newMerkleRoot) external onlyOwner {
        merkleRoot = newMerkleRoot;
    }

    function setScannerMintAnyAmount(uint256 _amount) external onlyOwner {
        scannerMintAmountAny = _amount;
    }

    function setScannerMintSeededAmount(uint256 _amount) external onlyOwner {
        scannerMintAmountSeeded = _amount;
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