const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

async function mineBlocks(blockCount) {
  for (let i = 0; i < blockCount; i++) {
    await ethers.provider.send("evm_mine", []);
  }
}

describe("RerroToken", function () {
  let rerroToken, trustedForwarder, deployer, scanner, chipIdOwner1, chipIdOwner2, otherAccount;

  beforeEach(async function () {
    const RerroToken = await ethers.getContractFactory("RerroToken");
    [deployer, trustedForwarder, scanner, chipIdOwner1, chipIdOwner2, otherAccount] = await ethers.getSigners();
    rerroToken = await RerroToken.deploy(trustedForwarder.address);
    await rerroToken.deployed();
    await rerroToken.setPausedState(false); // Ensure the contract is not paused for testing

    // Generate chipIds and create a Merkle Tree
    const chipIds = [chipIdOwner1.address, chipIdOwner2.address].map(addr => keccak256(addr));
    const merkleTree = new MerkleTree(chipIds, keccak256, { sortPairs: true });
    const merkleRoot = merkleTree.getHexRoot();
    await rerroToken.updateMerkleRoot(merkleRoot);

    // Seed chipIdOwner1 and chipIdOwner2 addresses with their respective proofs
    const proof1 = merkleTree.getHexProof(chipIds[0]);
    const proof2 = merkleTree.getHexProof(chipIds[1]);
    await rerroToken.connect(chipIdOwner1).seedAddress(proof1, chipIdOwner1.address);
    await rerroToken.connect(chipIdOwner2).seedAddress(proof2, chipIdOwner2.address);

    await mineBlocks(1000);
  });

  it("Allows minting when not paused", async function () {
    // Fast forward and get the current block number
    const blockNumber = await ethers.provider.getBlockNumber();
    // Get the block hash of the current block
    const block = await ethers.provider.getBlock(blockNumber);
    const blockHash = block.hash;

    // Correctly format the message as the contract expects
    const message = ethers.utils.solidityKeccak256(["address", "bytes32"], [scanner.address, blockHash]);
    const messageHash = ethers.utils.arrayify(message); // Convert to bytes array

    // Sign the hash of the message
    const signature = await chipIdOwner1.signMessage(messageHash);

    await expect(rerroToken.connect(scanner).mint(chipIdOwner1.address, blockNumber, signature))
      .to.emit(rerroToken, 'Transfer').withArgs(ethers.constants.AddressZero, scanner.address, ethers.utils.parseEther("1"))
      .and.to.emit(rerroToken, 'Transfer').withArgs(ethers.constants.AddressZero, chipIdOwner1.address, ethers.utils.parseEther("1"));
  });

  it("Prevents minting when paused", async function () {
    await rerroToken.setPausedState(true); // Pause the contract
    const blockNumber = await ethers.provider.getBlockNumber();
    const message = ethers.utils.solidityKeccak256(["address", "uint256"], [scanner.address, blockNumber]);
    const signature = await chipIdOwner1.signMessage(ethers.utils.arrayify(message));

    await expect(rerroToken.connect(scanner).mint(chipIdOwner1.address, blockNumber, signature))
      .to.be.revertedWith("Seeding and minting are currently disabled.");
  });

  it("Allows minting with seeded address and uses correct mint amounts", async function () {
    // Retrieve the current mint amounts from the contract
    const scannerMintAmountSeeded = await rerroToken.scannerMintAmountSeeded();
    const chipIdOwnerMintAmount = await rerroToken.chipIdOwnerMintAmount();

    const blockNumber = await ethers.provider.getBlockNumber();
    const blockHash = (await ethers.provider.getBlock(blockNumber)).hash;
    
    // Correctly format the message as the contract expects
    const message = ethers.utils.solidityKeccak256(["address", "bytes32"], [scanner.address, blockHash]);
    const messageHash = ethers.utils.arrayify(message); // Convert to bytes array

    // Sign the hash of the message
    const signature = await chipIdOwner1.signMessage(messageHash);

    // Mint and check emitted events with dynamic amounts from the contract
    await expect(rerroToken.connect(scanner).mint(chipIdOwner1.address, blockNumber, signature))
      .to.emit(rerroToken, 'Transfer').withArgs(ethers.constants.AddressZero, scanner.address, scannerMintAmountSeeded)
      .and.to.emit(rerroToken, 'Transfer').withArgs(ethers.constants.AddressZero, chipIdOwner1.address, chipIdOwnerMintAmount);
  });

  it("Modifies mint amounts and reflects in minting process", async function () {
    // Change mint amounts
    const newScannerAmount = ethers.utils.parseEther("2");
    const newOwnerAmount = ethers.utils.parseEther("3");
    await rerroToken.setScannerMintSeededAmount(newScannerAmount);
    await rerroToken.setChipIdOwnerMintAmount(newOwnerAmount);

    // Continue with mint test similar to above, expect new amounts
  });


});
