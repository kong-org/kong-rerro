const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const readline = require("readline");

// Helper functions for interactive input
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function askQuestion(query) {
    const rl = createReadlineInterface();
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

describe("RerroToken Interactive Test with Chip Address Seeding", function () {
    this.timeout(1200000);
    let rerroToken, deployer, trustedForwarder, otherAccount;

    before(async function () {
        [deployer, trustedForwarder, otherAccount] = await ethers.getSigners();
        const RerroToken = await ethers.getContractFactory("RerroToken");
        rerroToken = await RerroToken.deploy(trustedForwarder.address);
        await rerroToken.deployed();
        await rerroToken.setPausedState(false);
    });

    it("Interactive seeding and minting with user-provided signature", async function () {
        // Prompt for the chip address to seed
        const chipAddress = await askQuestion("Enter the chip address to seed: ");

        const leaves = [chipAddress].map(x => keccak256(x));
        const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const merkleRoot = merkleTree.getHexRoot();
        await rerroToken.updateMerkleRoot(merkleRoot);
        
        // Right after generating the Merkle proof for the correctly encoded chip address
        const proof = merkleTree.getHexProof(keccak256(chipAddress));

        // Seed the chip address with the Merkle proof
        // Make sure to use 'await' to ensure the transaction completes before moving on
        await rerroToken.connect(deployer).seedAddress(proof, chipAddress);

        // Continue with the minting process as before...
        const blockNumber = await ethers.provider.getBlockNumber();
        const blockHash = (await ethers.provider.getBlock(blockNumber)).hash;

        // Construct the digest to be signed
        const digest = ethers.utils.solidityPack(["address", "bytes32"], [otherAccount.address, blockHash]);

        // Wait for the user to sign the digest and paste the signature
        console.log(`Please sign the digest ${digest} using your wallet and paste the signature here:`);
        const signature = await askQuestion("Signature: ");

        // Call the mint function with the user address, block number, and provided signature
        await expect(rerroToken.connect(otherAccount).mint(chipAddress, blockNumber, signature))
            .to.emit(rerroToken, 'Transfer')
            .withArgs(ethers.constants.AddressZero, otherAccount.address, ethers.utils.parseEther("1")); // Adjust according to actual mint logic

        console.log("Token minted with the provided signature.");
    });

    // Add more tests or before/after hooks as needed
});
