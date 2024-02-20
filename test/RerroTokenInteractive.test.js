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

    it("Interactive seeding and minting with user-provided signature", async function () {

        const provider = ethers.provider; // Using Hardhat's default provider

        // Prompt for the chip address to seed
        const chipAddress = await askQuestion("Enter the chip address to seed: ");

        // Send the chipAddress some Ether to cover gas costs
        await deployer.sendTransaction({
            to: chipAddress,
            value: ethers.utils.parseEther("1") // Sending 1 ETH for example
        });
        const chipBalance = await provider.getBalance(chipAddress);
        console.log(`Chip balance: ${chipBalance}`);

        await rerroToken.bulkSeed([chipAddress]);

        const chainId = await hre.network.config.chainId;
        console.log(`Chain ID: ${chainId}`);
    
        const nonce = await provider.getTransactionCount(chipAddress);
        console.log(`Nonce: ${nonce}`);

        const data = rerroToken.interface.encodeFunctionData("mint", [scanner.address]);
        console.log(`Data: ${data}`);
    
        const transaction = {
            to: rerroToken.address,
            nonce: nonce,
            gasLimit: ethers.utils.hexlify(1000000), // Example gas limit
            gasPrice: ethers.utils.hexlify(ethers.utils.parseUnits('10', 'gwei')), // Example gas price
            data: data,
            chainId: chainId,
        };
    
        const tx = await ethers.utils.resolveProperties(transaction);
        console.log(`Resolved transaction: ${JSON.stringify(tx, null, 2)}`);
        const rawTx = ethers.utils.serializeTransaction(tx);
        console.log(`Raw transaction: ${rawTx}`);
        const digest = ethers.utils.keccak256(rawTx);

        // Construct the digest to be signed
        // const digest = ethers.utils.solidityPack(["address", "bytes32"], [otherAccount.address, blockHash]);

        // Wait for the user to sign the digest and paste the signature
        console.log(`Please sign the digest ${digest} using your wallet and paste the signature here:`);
        // Prompt for signature components
        const r = await askQuestion("r component of the signature: ");
        const s = await askQuestion("s component of the signature: ");
        const v = await askQuestion("v component of the signature (decimal): ");

        // TODO: verify whether or not we once again need to resolve properties and/or serialize the transaction before sending
        const signature = {
            r: r,
            s: s,
            v: v
        };

        // const signedTx = await ethers.utils.resolveProperties(transaction);
        // console.log(`Transaction with signature: ${JSON.stringify(signedTx, null, 2)}`);
        const signedTransaction = ethers.utils.serializeTransaction(tx, signature);
        // console.log(`Signed transaction: ${signedTransaction}`);
        const parsedTx = ethers.utils.parseTransaction(signedTransaction);
        // console.log(`Parsed transaction: ${JSON.stringify(parsedTx, null, 2)}`);
        
        // const signature = await askQuestion("Signature: ");
    
        const scannerBalanceBefore = await rerroToken.balanceOf(scanner.address);
        const txResponse = await provider.sendTransaction(signedTransaction);
        // console.log(`Transaction sent: ${txResponse}`);
        await txResponse.wait(); // Wait for the transaction to be mined

        // Test that the balance of the scanner has increased by the default mint amount
        const mintAmount = await rerroToken.defaultMintAmount();
        const scannerBalanceAfter = await rerroToken.balanceOf(scanner.address);
        expect(scannerBalanceAfter.sub(scannerBalanceBefore)).to.equal(mintAmount);
        console.log("Token minted with the provided signature.");
    });
});
