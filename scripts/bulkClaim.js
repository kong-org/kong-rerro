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

async function readFromFile(filePath) {
    const fileContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
    const rows = fileContent.split('\n');
    return rows.map(row => {
        const [chipId, mintAmount, ownerPublicKey] = row.split(','); // Adjusted to include ownerPublicKey
        return { chipId, mintAmount: parseInt(mintAmount, 10), ownerPublicKey };
    }).filter(entry => entry.chipId.length > 0 && !isNaN(entry.mintAmount) && entry.ownerPublicKey.length > 0);
}

function publicKeyToAddress(publicKey) {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const addressBuffer = keccak256(publicKeyBuffer.slice(1)).slice(-20);
    return toChecksumAddress(`0x${addressBuffer.toString('hex')}`);
}

async function bulkClaim(entries) {
    const chipIds = entries.map(entry => publicKeyToAddress(entry.chipId));
    const mintAmounts = entries.map(entry => entry.mintAmount);
    const owners = entries.map(entry => publicKeyToAddress(entry.ownerPublicKey));
    console.log(`Claiming for ${chipIds.length} chips`);
    await contract.bulkClaim(chipIds, mintAmounts, owners).then((tx) => tx.wait());
    console.log('Bulk claim transaction submitted.');
}

(async () => {
    const filePath = 'chipPublicKeys.csv'; // Set the filename here.
    const entries = await readFromFile(filePath);
    await bulkClaim(entries);
})().catch(err => {
    console.error('Error in executing the script:', err);
});
