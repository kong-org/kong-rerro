const { ethers, artifacts } = require("hardhat");
const { instantiateGateway, getChipSigWithGateway } = require('../src/halo.js');
require("dotenv").config();

// Wrap the top-level code in an async IIFE
(async () => {
    // Get the contract ABI
    const artifact = await artifacts.readArtifact("RerroToken");

    // The contract API could be added as a JSON blob instead
    const abi = artifact.abi;
  
    // Get the provider from Hardhat's default environment
    const provider = hre.ethers.provider;
  
    // RerroToken and Forwarder Contract Addresses
    // TODO: move these to environment variables, specfic to deployment
    const rerroAddress = "0xB709b74d34ec337992d3EE00C386A2Bc4cEacc84";
    const forwarderAddress = "0x4266814eB1c683AAf8574bd7D4D5450bb5F74E88";
  
    // Initialize contract instance
    const rerroToken = new ethers.Contract(rerroAddress, abi, provider);
  
    // Chain ID
    // TODO: move this to environment variable
    const chainId = "11155111"
  
    // Get the relayer url from the environment
    const url = process.env.ACTION_WEBHOOK_URL;
  
    // Scanner address which will receive minted tokens
    const scannerAddress = "0x1dCD8763c01961C2BbB5ed58C6E51F55b1378589"; // Replace with the address to mint to
  
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
    
    async function sendMetaTx(provider, scanner) {
      if (!url) throw new Error(`Missing relayer url`);
    
      // Instantiate the HaLo gateway (desktop)
      const gateway = await instantiateGateway();
    
      const transaction = {
        to: rerroToken.address,
        value: 0,
        gas: ethers.utils.hexlify(1000000), // gas limit
        deadline: ethers.utils.hexlify(Math.floor(Date.now() / 1000) + 60 * 1440), // 1 day
        salt: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
        data: rerroToken.interface.encodeFunctionData("mint", [scanner]),
        chainId: chainId,
      };
    
      const typedData = await buildEIP712TypedData(chainId, forwarderAddress, transaction);
    
      // Get the chip signature through the gateway
      const chipSig = (await getChipSigWithGateway(gateway, typedData.domain, typedData.types, typedData.value));
      console.log("Received mint signature, awaiting relay...")

      const signature = {
          r: '0x' + chipSig.signature.raw.r,
          s: '0x' + chipSig.signature.raw.s,
          v: chipSig.signature.raw.v
      };
      
      transaction.from = chipSig.etherAddress;
    
      const request = {
        request: transaction,
        signature: signature,
      };
    
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(request),
          headers: { 'Content-Type': 'application/json' },
        });
    
        // Assuming the server responds with JSON
        const responseData = await response.json();
        console.log("Transaction posted successfully:", responseData);
      } catch (error) {
        console.error("Failed to post transaction:", error);
      }
    }

    // Call the function
    try {
      const response = await sendMetaTx(provider, scannerAddress);
    } catch (error) {
      console.error("Failed to send meta-tx:", error);
    }
})();