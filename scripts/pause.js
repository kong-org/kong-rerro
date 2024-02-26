const hre = require("hardhat");
const fs = require('fs');
const path = require('path');
require("dotenv").config();

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
        return { rerroAddress: '', contractABI: [] };
    }

    // Read the artifact file
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

    // Extract the ABI
    const contractABI = artifact.abi;

    // TODO: get this from env/deployments
    const rerroAddress = process.env[`${networkName.toUpperCase()}_RERRO_ADDRESS`]; // Set this based on your deployment

    return { rerroAddress, contractABI };
}

const { rerroAddress, contractABI } = loadContractDetails(contractName);
console.log(`Contract address: ${rerroAddress}`);
const contract = new ethers.Contract(rerroAddress, contractABI, signer);

async function setMintPause(state) {
    await contract.setMintPausedState(state).then((tx) => tx.wait());
    console.log(`Set mint paused state set to ${state}`);
}

async function setClaimOwnershipPaused(state) {
    await contract.setClaimOwnershipPausedState(state).then((tx) => tx.wait());
    console.log(`Set claimOwnership paused state set to ${state}`);
}

// Main script execution
(async () => {
    // TODO: prompt user for these
    const setMintPausedBool = false
    const setClaimOwnershipPausedBool = false
    await setMintPause(setMintPausedBool);
    await setClaimOwnershipPaused(setClaimOwnershipPausedBool);
})().catch(err => {
    console.error('Error in executing the script:', err);
});
