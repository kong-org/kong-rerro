const { expect } = require("chai");
const { ethers } = require("hardhat");
const readline = require("readline");
const { relay } = require('../../action/index.js');

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

async function deploy(name, ...params) {
    const Contract = await ethers.getContractFactory(name);
    return await Contract.deploy(...params).then(f => f.deployed());
  }
  

const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' }
  ];
  
  const ForwardRequest = [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'gas', type: 'uint256' },
    { name: 'salt', type: 'uint256' },
    { name: 'data', type: 'bytes' },
  ];

async function buildEIP712TypedData(chainId, verifyingContractAddress, transaction) {
    console.log(`chainId: ${chainId}`);
    const domain = {
      name: 'MinimalForwarder',
      version: '0.0.2',
      chainId: chainId,
      verifyingContract: verifyingContractAddress,
    };

    const types = {
      ForwardRequest,
      // Add any other types your transaction requires
    };
  
    const value = {
      to: transaction.to,
      value: transaction.value,
      gas: transaction.gas,
      salt: transaction.salt,
      data: transaction.data,
      // Include other properties as per your transaction's needs
    };
  
    return {
      types,
      primaryType: 'ForwardRequest',
      domain,
      value,
    };
  }

describe.only("RerroToken Interactive Test with Chip Address Seeding", function () {
    this.timeout(1200000);
    let rerroToken, forwarder, deployer, scanner;

    before(async function () {
        [deployer, scanner] = await ethers.getSigners();

        forwarder = await deploy('MinimalForwarder');
        rerroToken = await deploy("RerroToken", forwarder.address);  

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
        // const saltBytes = ethers.utils.randomBytes(32);
        const saltBytes = 1;
        const salt = ethers.utils.hexlify(saltBytes);
        const data = rerroToken.interface.encodeFunctionData("mint", [scanner.address]);
    
        const transaction = {
            to: rerroToken.address,
            value: 0,
            gas: ethers.utils.hexlify(1000000), // gas limit
            salt: salt,
            data: ethers.utils.keccak256(data),
            chainId: chainId,
        };
    
        // TODO: we need to migrate this test to building up an EIP712 message that is then hashed and presented as the digest below for signing

        // const tx = await ethers.utils.resolveProperties(transaction);
        // const rawTx = ethers.utils.serializeTransaction(tx);

        const typedData = await buildEIP712TypedData(chainId, forwarder.address, transaction);

        // Hash the typed data
        const digest = ethers.utils._TypedDataEncoder.hash(typedData.domain, typedData.types, typedData.value);
        console.log(`digest: ${digest}`);
      
        // Wait for the user to sign the digest and paste the signature -- use HaLo signing demo https://halo-demos.arx.org/examples/demo.html
        console.log(`Please sign the digest ${digest} using your wallet and paste the signature here:`);
        
        // Prompt for signature components
        // const r = await askQuestion("r component of the signature: ");
        // const s = await askQuestion("s component of the signature: ");
        // const v = await askQuestion("v component of the signature (decimal): ");

        // const signature = {
        //     r: r,
        //     s: s,
        //     v: v
        // };

        const signature = await askQuestion("Paste the ether formatted signature here: ");

        console.log(`signature: ${signature}`);
        console.log(`hashed data: ${transaction.data}`);   

        // Adding back chip address, but maybe we want to add this as an explicit param to the forwarder
        transaction.from = chipAddress;

        // Adding back the unhashed data which is expected by the contract
        transaction.data = data;

        const whitelist = [rerroToken.address]
        await relay(forwarder, transaction, signature, whitelist);
    
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
