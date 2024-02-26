const { expect } = require("chai");
const { ethers } = require("hardhat");
require("dotenv").config();

describe("RerroToken with ERC2771", function () {
    let rerroToken, trustedForwarder, deployer, chipId1, chipId2, scanner, arxCertSigner;

    beforeEach(async function () {
        [deployer, trustedForwarder, chipId1, chipId2, scanner, arxCertSigner] = await ethers.getSigners();
        const RerroToken = await ethers.getContractFactory("RerroToken");
        rerroToken = await RerroToken.deploy(trustedForwarder.address, arxCertSigner.address);
        await rerroToken.deployed();
        await rerroToken.setMintPausedState(false);

        // Seed chips with a default mint amount
        await rerroToken.bulkSeed([chipId1.address, chipId2.address]);
    });

    it("Allows minting from a chip when not paused", async function () {
      // Capture the scanner's balance before minting
      const balanceBefore = await rerroToken.balanceOf(scanner.address);
      
      // Perform the mint operation from the chip's perspective
      await rerroToken.connect(chipId1).mint(scanner.address);
  
      // Capture the scanner's balance after minting
      const balanceAfter = await rerroToken.balanceOf(scanner.address);
  
      // Calculate the expected balance after minting
      const expectedBalanceAfter = balanceBefore.add(await rerroToken.defaultMintAmount());
  
      // Assert that the scanner's balance has increased by the expected mint amount
      expect(balanceAfter).to.equal(expectedBalanceAfter);
    });

    it("Prevents minting from a chip when paused", async function () {
        await rerroToken.setMintPausedState(true);
        
        // Attempt to mint from the chip's perspective while minting is paused
        await expect(rerroToken.connect(chipId1).mint(scanner.address))
            .to.be.revertedWith("Seeding and minting are currently disabled.");
    });

    it("Reflects changes in mint amounts", async function () {
        const newMintAmount = ethers.utils.parseEther("2");
        await rerroToken.setMintAmount(chipId1.address, newMintAmount);

        await expect(await rerroToken.connect(chipId1).mint(scanner.address))
            .to.emit(rerroToken, 'Transfer')
            .withArgs(ethers.constants.AddressZero, scanner.address, newMintAmount);
    });

});