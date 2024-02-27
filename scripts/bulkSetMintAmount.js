const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
const { keccak256, toChecksumAddress } = require('ethereumjs-util');

const networkName = hre.network.name;
const privateKey = process.env[`${networkName.toUpperCase()}_PRIVATE_KEY`];
const signer = new hre.ethers.Wallet(privateKey, hre.ethers.provider);

const contractName = 'RerroToken';
const artifactsDir = path.join(__dirname, '../', 'artifacts', 'contracts');

function loadContractDetails(contractName) {
    const artifactPath = path.join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
    if (!fs.existsSync(artifactPath)) {
        console.error('Artifact file does not exist:', artifactPath);
        return { rerroAddress: '', contractABI: [] };
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    const contractABI = artifact.abi;
    const rerroAddress = process.env[`${networkName.toUpperCase()}_RERRO_ADDRESS`];

    return { rerroAddress, contractABI };
}

const { rerroAddress, contractABI } = loadContractDetails(contractName);
console.log(`Contract address: ${rerroAddress}`);
const contract = new hre.ethers.Contract(rerroAddress, contractABI, signer);

async function readPublicKeysAndMintAmountsFromFile(filePath) {
    const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const rows = fileContent.split('\n');
    return rows.map(row => {
        const [publicKey, mintAmount] = row.split(','); // Assuming CSV format is publicKey,mintAmount
        return { publicKey, mintAmount: parseInt(mintAmount, 10) };
    }).filter(entry => entry.publicKey.length > 0 && !isNaN(entry.mintAmount));
}

function publicKeyToAddress(publicKey) {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const addressBuffer = keccak256(publicKeyBuffer.slice(1)).slice(-20);
    return toChecksumAddress(`0x${addressBuffer.toString('hex')}`);
}

async function bulkSeedChips(entries) {
    const addresses = entries.map(entry => publicKeyToAddress(entry.publicKey));
    const mintAmounts = entries.map(entry => entry.mintAmount);
    console.log(`Seeding ${addresses.length} addresses`);
    await contract.bulkSetMintAmount(addresses, mintAmounts).then((tx) => tx.wait());
    console.log('Bulk set mint amount transaction submitted.');
}

(async () => {
    const filePath = 'chipPublicKeys.csv'; // Assuming the file is named chipPublicKeys.csv
    const entries = await readPublicKeysAndMintAmountsFromFile(filePath);
    await bulkSeedChips(entries);
})().catch(err => {
    console.error('Error in executing the script:', err);
});