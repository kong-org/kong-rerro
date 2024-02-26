const hre = require("hardhat");

async function main() {
  // Logging the public address of the deployer's private key
  const networkName = hre.network.name;
  const privateKey = process.env[`${networkName.toUpperCase()}_PRIVATE_KEY`];

  if (!privateKey) {
    throw new Error(`Private key for network ${networkName} is not set.`);
  }

  // Derive the address from the private key
  const wallet = new hre.ethers.Wallet(privateKey, hre.ethers.provider);
  console.log("Deploying contracts with the account:", wallet.address);

  // Deploy the MinimalForwarder contract
  const MinimalForwarderContract = await hre.ethers.getContractFactory("MinimalForwarder");
  const minimalForwarder = await MinimalForwarderContract.deploy();

  console.log("MinimalForwarder deployed to:", minimalForwarder.address);

  // Deploy the $RERRO contract
  const RerroContract = await hre.ethers.getContractFactory("RerroToken");
  const rerroContract = await RerroContract.deploy(minimalForwarder.address, "0x2b9Eea440875F28c982D0bAA23C53353C9142F16"); // This is the "production" signer address

  await rerroContract.deployed();

  console.log("RerroToken deployed to:", rerroContract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
