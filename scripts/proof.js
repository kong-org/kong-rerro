const { ethers } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");
const fs = require("fs");
const path = require("path");

// Assuming the file is named `publicKeys.txt` and is located at the root of your project
const filePath = path.join(__dirname, "publicKeys.txt");

// Read the file synchronously, split by new lines to get an array of keys
const fileContent = fs.readFileSync(filePath, { encoding: "utf-8" });
const publicKeys = fileContent.split("\n").filter(line => line.length > 0); // Filter out any empty lines

// Convert public keys to Ethereum addresses
const addresses = publicKeys.map(key => {
  // Public keys are already in the correct format, just remove the '04' prefix
  const publicKey = key.slice(2); // Remove 04 prefix
  const address = ethers.utils.computeAddress(`0x${publicKey}`);
  return address.toLowerCase(); // Ensure addresses are lowercase for consistency
});

console.log("Ethereum Addresses:", addresses);

// Generate the Merkle Tree
const leaves = addresses.map(addr => keccak256(addr));
const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });

// Output the Merkle Root
const root = merkleTree.getRoot().toString('hex');
console.log("Merkle Root:", root);

// Example of generating a Merkle Proof for the first address
const leaf = leaves[0];
const proof = merkleTree.getHexProof(leaf);
console.log("Proof for first address:", proof);
