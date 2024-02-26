const { expect } = require("chai");
const { ethers } = require("hardhat");
const { relay } = require('../../action/index.js');
const { instantiateGateway, getChipSigWithGateway, getChipPublicKeys } = require('../../src/halo.js');
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getSignatureForAddress(ethAddress) {
    const hashedAddress = ethers.utils.keccak256(ethAddress);

    // Query Supabase for the signature corresponding to the hashed Ethereum address
    let { data, error } = await supabase
        .from('certs')
        .select('chipCert')
        .eq('chipHash', hashedAddress)
        .single();

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return data.chipCert;
}

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
        { type: 'uint48', name: 'deadline' },
        { type: 'uint256', name: 'salt' },
        { type: 'bytes', name: 'data' },
      ]
    };
  
    const value = {
      to: transaction.to,
      value: transaction.value,
      gas: transaction.gas,
      deadline: transaction.deadline,
      salt: transaction.salt,
      data: transaction.data,
    };
  
    return {
      types,
      domain,
      value,
    };
  }

describe("RerroToken Interactive Test with Chip Address Seeding", function () {
    this.timeout(1200000);
    let rerroToken, forwarder, deployer, scanner, scanner2, scanner3, chipOwner;
    let gateway = null;

    const provider = ethers.provider; // Using Hardhat's default provider
    let arxCertSignerPrivateKey = process.env.CERT_PRIVATE_KEY;
    let arxCertSigner = new ethers.Wallet(arxCertSignerPrivateKey, provider);

    before(async function () {
        [deployer, scanner, scanner2, scanner3, chipOwner] = await ethers.getSigners();

        forwarder = await deploy('MinimalForwarder');
        console.log(`Deploying RerroToken with certSigner: ${arxCertSigner.address}`)
        rerroToken = await deploy("RerroToken", forwarder.address, arxCertSigner.address);  

        await rerroToken.deployed();
        await rerroToken.setMintPausedState(false);

        console.log("Note: distinct HaLo chips should be used for each test.")

        // Set up the HaLo gateway
        gateway = await instantiateGateway();
    });

    it("Interactive seeding and minting with user-provided signature", async function () {

        // Scan the chip and get the public keys
        const [ chipAddress, pk2, _rawKeys ] = await getChipPublicKeys(gateway);

        // Send the chipAddress some Ether to cover gas costs
        // await deployer.sendTransaction({
        //     to: chipAddress,
        //     value: ethers.utils.parseEther("1") // Sending 1 ETH for example
        // });

        await rerroToken.bulkSeed([chipAddress]);

        const data = rerroToken.interface.encodeFunctionData("mint", [scanner.address]);

        const chainId = await hre.network.config.chainId;    
        const saltBytes = ethers.utils.randomBytes(32);
        const salt = ethers.utils.hexlify(saltBytes);
    
        const transaction = {
            to: rerroToken.address,
            value: 0,
            gas: ethers.utils.hexlify(1000000), // gas limit
            deadline: ethers.utils.hexlify(Math.floor(Date.now() / 1000) + 60 * 1440), // 1 day
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

        // Add the chipAddress as the from address; note since we typically get this after the fact, we can't use the `from` field when signing the transaction
        transaction.from = chipAddress;

        const whitelist = [rerroToken.address]
        // Relay the transaction to the forwarder
        await relay(forwarder, transaction, signature, whitelist);

        // Test that the balance of the scanner has increased by the default mint amount
        const mintAmount = await rerroToken.defaultMintAmount();
        const scannerBalanceAfter = await rerroToken.balanceOf(scanner.address);
        expect(scannerBalanceAfter.sub(scannerBalanceBefore)).to.equal(mintAmount);
    });

    it("Claim a chip, then mint", async function () {
        const provider = ethers.provider; // Using Hardhat's default provider

        // Unpasue the claim ownership, otherwise minting amounts will be incorrect
        await rerroToken.setClaimOwnershipPausedState(false);

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
        const data = rerroToken.interface.encodeFunctionData("claimOwnership", [chipOwner.address]);
    
        const transaction = {
            to: rerroToken.address,
            value: 0,
            gas: ethers.utils.hexlify(1000000), // gas limit
            deadline: ethers.utils.hexlify(Math.floor(Date.now() / 1000) + 60 * 1440), // 1 day
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

        // Check the scanner balance before minting
        const chipOwnerBalanceBefore = await rerroToken.balanceOf(chipOwner.address);
        const scannerBalanceBefore = await rerroToken.balanceOf(scanner2.address);

        // Add the chipAddress as the from address; note since we typically get this after the fact, we can't use the `from` field when signing the transaction
        transaction.from = chipAddress;

        const whitelist = [rerroToken.address]
        // Relay the transaction to the forwarder
        await relay(forwarder, transaction, signature, whitelist); 

        const saltBytesMint = ethers.utils.randomBytes(32);
        const saltMint = ethers.utils.hexlify(saltBytesMint);
        const dataMint = rerroToken.interface.encodeFunctionData("mint", [scanner2.address]);
    
        const transactionMint = {
            to: rerroToken.address,
            value: 0,
            gas: ethers.utils.hexlify(1000000), // gas limit
            deadline: ethers.utils.hexlify(Math.floor(Date.now() / 1000) + 60 * 1440), // 1 day
            salt: saltMint,
            data: dataMint,
            chainId: chainId,
        };
    
        const typedDataMint = await buildEIP712TypedData(chainId, forwarder.address, transactionMint);

        const signatureRawMint = (await getChipSigWithGateway(gateway, typedDataMint.domain, typedDataMint.types, typedDataMint.value)).signature.raw;
        const signatureMint = {
            r: '0x' + signatureRawMint.r,
            s: '0x' + signatureRawMint.s,
            v: signatureRawMint.v
        };

        transactionMint.from = chipAddress;

        await relay(forwarder, transactionMint, signatureMint, whitelist);

        // Test that the balance of the scanner has increased by the default mint amount
        const mintAmount = await rerroToken.defaultClaimedMintAmount();
        const chipOwnerMintAmount = await rerroToken.chipIdOwnerMintAmount();

        const chipOwnerBalanceAfter = await rerroToken.balanceOf(chipOwner.address);
        const scannerBalanceAfter = await rerroToken.balanceOf(scanner2.address);

        expect(chipOwnerBalanceAfter.sub(chipOwnerBalanceBefore)).to.equal(chipOwnerMintAmount);
        expect(scannerBalanceAfter.sub(scannerBalanceBefore)).to.equal(mintAmount);
        
    });

    it("Interactive seeding and minting with user-provided signature and chip cert", async function () {

        // Scan the chip and get the public keys
        const [ chipAddress, pk2, _rawKeys ] = await getChipPublicKeys(gateway);

        await rerroToken.bulkSeed([chipAddress]);

        const cert = await getSignatureForAddress(chipAddress);

        const data = rerroToken.interface.encodeFunctionData("mintWithSignature", [scanner3.address, cert]);
        
        const chainId = await hre.network.config.chainId;    
        const saltBytes = ethers.utils.randomBytes(32);
        const salt = ethers.utils.hexlify(saltBytes);
    
        const transaction = {
            to: rerroToken.address,
            value: 0,
            gas: ethers.utils.hexlify(1000000), // gas limit
            deadline: ethers.utils.hexlify(Math.floor(Date.now() / 1000) + 60 * 1440), // 1 day
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
        const scannerBalanceBefore = await rerroToken.balanceOf(scanner3.address);

        // Add the chipAddress as the from address; note since we typically get this after the fact, we can't use the `from` field when signing the transaction
        transaction.from = chipAddress;

        const whitelist = [rerroToken.address]
        // Relay the transaction to the forwarder
        await relay(forwarder, transaction, signature, whitelist);

        // Test that the balance of the scanner has increased by the default mint amount
        const mintAmount = await rerroToken.defaultMintAmount();
        const scannerBalanceAfter = await rerroToken.balanceOf(scanner3.address);
        expect(scannerBalanceAfter.sub(scannerBalanceBefore)).to.equal(mintAmount);
    });

});
