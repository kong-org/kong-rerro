const { expect } = require("chai");
const { ethers } = require("hardhat");
const { relay } = require('../../action/index.js');
const { instantiateGateway, getChipSigWithGateway, getChipPublicKeys } = require('../../src/halo.js');

async function deploy(name, ...params) {
    const Contract = await ethers.getContractFactory(name);
    return await Contract.deploy(...params).then(f => f.deployed());
  }

async function buildEIP712TypedData(chainId, verifyingContractAddress, transaction) {
    const domain = {
      name: 'MinimalForwarder',
      version: '0.0.2',
      chainId: chainId,
      verifyingContract: verifyingContractAddress,
    };

    const types = {
      ForwardRequest: [
        { type: 'address', name: 'to' },
        { type: 'uint256', name: 'value' },
        { type: 'uint256', name: 'gas' },
        { type: 'uint256', name: 'salt' },
        { type: 'bytes', name: 'data' },
      ]
    };
  
    const value = {
      to: transaction.to,
      value: transaction.value,
      gas: transaction.gas,
      salt: transaction.salt,
      data: transaction.data,
    };
  
    return {
      types,
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

    it("Interactive seeding and minting with user-provided signature", async function () {
        const provider = ethers.provider; // Using Hardhat's default provider

        // Set up the HaLo gateway
        const gateway = await instantiateGateway();

        // Scan the chip and get the public keys
        const [ chipAddress, pk2, _rawKeys ] = await getChipPublicKeys(gateway);

        // Send the chipAddress some Ether to cover gas costs
        await deployer.sendTransaction({
            to: chipAddress,
            value: ethers.utils.parseEther("1") // Sending 1 ETH for example
        });

        await rerroToken.bulkSeed([chipAddress]);

        const chainId = await hre.network.config.chainId;    
        const saltBytes = ethers.utils.randomBytes(32);
        const salt = ethers.utils.hexlify(saltBytes);
        const data = rerroToken.interface.encodeFunctionData("mint", [scanner.address]);

        console.log(rerroToken.address);
    
        const transaction = {
            to: rerroToken.address,
            value: 0,
            gas: ethers.utils.hexlify(1000000), // gas limit
            salt: salt,
            data: data,
            chainId: chainId,
        };
    
        const typedData = await buildEIP712TypedData(chainId, forwarder.address, transaction);

        const signatureRaw = (await getChipSigWithGateway(gateway, typedData.domain, typedData.types, typedData.value)).signature.raw;
        const signature = {
            r: '0x' + signatureRaw.r,
            s: '0x' + signatureRaw.s,
            v: signatureRaw.v
        };

        // Sanity check
        const result = ethers.utils.verifyTypedData(typedData.domain, typedData.types, typedData.value, signature);
        expect(result).to.equal(chipAddress);

        // Check the scanner balance before minting
        const scannerBalanceBefore = await rerroToken.balanceOf(scanner.address);

        const whitelist = [rerroToken.address]
        // Relay the transaction to the forwarder
        await relay(forwarder, chipAddress, transaction, signature, whitelist);

        // Test that the balance of the scanner has increased by the default mint amount
        const mintAmount = await rerroToken.defaultMintAmount();
        const scannerBalanceAfter = await rerroToken.balanceOf(scanner.address);
        expect(scannerBalanceAfter.sub(scannerBalanceBefore)).to.equal(mintAmount);
    });
});
