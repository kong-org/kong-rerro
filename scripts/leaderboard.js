const { ethers } = require("hardhat");
require("dotenv").config();

const provider = hre.ethers.provider;
const networkName = hre.network.name;

// Function to get minting transactions
async function getMintingTransactions(tokenAddress, fromBlock = 0, toBlock = 'latest') {
    const transferEventSignature = ethers.utils.id('Transfer(address,address,uint256)');
    const nullAddress = '0x0000000000000000000000000000000000000000000000000000000000000000';
    console.log(`Searching for minting transactions for token: ${tokenAddress}`);
    const filter = {
        address: tokenAddress,
        fromBlock,
        toBlock,
        topics: [transferEventSignature, nullAddress],
    };

    const logs = await provider.getLogs(filter);

    return logs.map(log => {
        // The 'to' address has already been correctly extracted from topics[2]
        const to = log.topics[2].replace('0x000000000000000000000000', '0x');
        
        // Decode only the transferred amount from the data
        const value = ethers.utils.defaultAbiCoder.decode(['uint256'], log.data)[0];
        
        return {
            to: to,
            value: ethers.utils.formatEther(value),
        };
    });
}

// Function to aggregate minting data and identify top minters
async function identifyTopMinters(tokenAddress, fromBlock = 0, toBlock = 'latest') {
    console.log(`Identifying top minters for token: ${tokenAddress}`);
    const transactions = await getMintingTransactions(tokenAddress, fromBlock, toBlock);
    const mintingData = {};

    transactions.forEach(tx => {
        if (mintingData[tx.to]) {
            mintingData[tx.to] += parseFloat(tx.value);
        } else {
            mintingData[tx.to] = parseFloat(tx.value);
        }
    });

    const sortedMinters = Object.entries(mintingData).sort((a, b) => b[1] - a[1]).slice(0, 10); // Get top 10
    console.log('Top Minters:');
    sortedMinters.forEach(([address, amount], index) => {
        console.log(`${index + 1}. Address: ${address}, Minted: ${amount} tokens`);
    });
}

const tokenAddress = process.env[`${networkName.toUpperCase()}_RERRO_ADDRESS`]; // Ensure you have this environment variable set
identifyTopMinters(tokenAddress)
    .catch(err => console.error(err));
