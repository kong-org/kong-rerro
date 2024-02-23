const { expect } = require("chai");
const { ethers } = require("hardhat");
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
    let rerroToken, deployer, trustedForwarder, scanner;

    before(async function () {
        [deployer, trustedForwarder, scanner] = await ethers.getSigners();
        const RerroToken = await ethers.getContractFactory("RerroToken");
        rerroToken = await RerroToken.deploy(trustedForwarder.address);
        await rerroToken.deployed();
        await rerroToken.setMintPausedState(false);
    });

    // TODO: migrate to trusted forwarder.
    it("Interactive seeding and minting with user-provided signature", async function () {
        const provider = ethers.provider; // Using Hardhat's default provider

        // Prompt for the chip address to seed
        const chipAddress = await askQuestion("Enter the chip address to seed: ");

        // Send the chipAddress some Ether to cover gas costs
        await deployer.sendTransaction({
            to: chipAddress,
            value: ethers.utils.parseEther("1") // Sending 1 ETH for example
        });

        await rerroToken.bulkSeed([chipAddress]);

        const chainId = await hre.network.config.chainId;    
        const nonce = await provider.getTransactionCount(chipAddress);
        const data = rerroToken.interface.encodeFunctionData("mint", [scanner.address]);
    
        const transaction = {
            to: rerroToken.address,
            nonce: nonce,
            gasLimit: ethers.utils.hexlify(1000000), // Example gas limit
            gasPrice: ethers.utils.hexlify(ethers.utils.parseUnits('10', 'gwei')), // Example gas price
            data: data,
            chainId: chainId,
        };
    
        // TODO: we need to migrate this test to building up an EIP712 message that is then hashed and presented as the digest below for signing

        const tx = await ethers.utils.resolveProperties(transaction);
        const rawTx = ethers.utils.serializeTransaction(tx);
        const digest = ethers.utils.keccak256(rawTx);

        // Wait for the user to sign the digest and paste the signature -- use HaLo signing demo https://halo-demos.arx.org/examples/demo.html
        console.log(`Please sign the digest ${digest} using your wallet and paste the signature here:`);
        
        // Prompt for signature components
        const r = await askQuestion("r component of the signature: ");
        const s = await askQuestion("s component of the signature: ");
        const v = await askQuestion("v component of the signature (decimal): ");

        const signature = {
            r: r,
            s: s,
            v: v
        };
        const signedTransaction = ethers.utils.serializeTransaction(tx, signature);
    
        const scannerBalanceBefore = await rerroToken.balanceOf(scanner.address);
        
        const txResponse = await provider.sendTransaction(signedTransaction);
        await txResponse.wait(); // Wait for the transaction to be mined

        // Test that the balance of the scanner has increased by the default mint amount
        const mintAmount = await rerroToken.defaultMintAmount();
        const scannerBalanceAfter = await rerroToken.balanceOf(scanner.address);
        expect(scannerBalanceAfter.sub(scannerBalanceBefore)).to.equal(mintAmount);
        console.log("Token minted with the provided signature.");
    });
});
