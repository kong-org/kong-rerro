const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { keccak256, toChecksumAddress } = require('ethereumjs-util');

const networkName = hre.network.name;
const privateKey = process.env[`${networkName.toUpperCase()}_PRIVATE_KEY`];
const signer = new hre.ethers.Wallet(privateKey, hre.ethers.provider);

// Assuming the contract name is provided. For example:
const contractName = 'RerroToken';

// Path to the artifacts directory
const artifactsDir = path.join(__dirname, '../', 'artifacts', 'contracts');

function loadContractDetails(contractName) {
    // Construct the path to the artifact file
    const artifactPath = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);

    if (!fs.existsSync(artifactPath)) {
        console.error('Artifact file does not exist:', artifactPath);
        return { contractAddress: '', contractABI: [] };
    }

    // Read the artifact file
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

    // Extract the ABI
    const contractABI = artifact.abi;

    // The contract address is not typically stored in the artifact file.
    // You'll need to obtain it from your deployment script or environment variables.
    // For demonstration, we'll leave it as an empty string.
    const contractAddress = '0xcC0A19420cdE09FB852A24F9C156A69E3EC16C4e'; // Set this based on your deployment

    return { contractAddress, contractABI };
}

const { contractAddress, contractABI } = loadContractDetails(contractName);
console.log(`Contract address: ${contractAddress}`);
const contract = new ethers.Contract(contractAddress, contractABI, signer);

async function readPublicKeysFromFile(filePath) {
    const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const lines = fileContent.split('\n');
    return lines.filter(line => line.length > 0);
}

function publicKeyToAddress(publicKey) {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const addressBuffer = keccak256(publicKeyBuffer.slice(1)).slice(-20);
    return toChecksumAddress(`0x${addressBuffer.toString('hex')}`);
}

async function bulkSeedChips(publicKeys) {
    const addresses = publicKeys.map(publicKey => publicKeyToAddress(publicKey));
    console.log(`Seeding the following addresses: ${addresses}`);
    await contract.bulkSeed(addresses).then((tx) => tx.wait());
    console.log('Bulk seed transaction submitted.');
}

// Main script execution
(async () => {
    const filePath = 'chipPublicKeys.txt';
    const publicKeys = await readPublicKeysFromFile(filePath);
    await bulkSeedChips(publicKeys);
})().catch(err => {
    console.error('Error in executing the script:', err);
});
