const { expect } = require("chai");
const { ethers } = require("hardhat");
const { signMetaTxRequest } = require("../src/signer");

async function deploy(name, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await Contract.deploy(...params).then(f => f.deployed());
}

describe("RerroToken MetaTx Tests", function() {
  beforeEach(async function() {
    this.forwarder = await deploy('MinimalForwarder');
    this.rerroToken = await deploy("RerroToken", this.forwarder.address);    
    this.accounts = await ethers.getSigners();
    await this.rerroToken.setMintPausedState(false);

    // Seed chips with a default mint amount
    await this.rerroToken.bulkSeed([this.accounts[1].address, this.accounts[2].address]);
  });

  it("mints token directly", async function() {
    const chip = this.accounts[1];
    const scanner = this.accounts[3];
    const rerroToken = this.rerroToken.connect(chip);
    
    // Capture the scanner's balance before minting
    const balanceBefore = await rerroToken.balanceOf(scanner.address);

    const receipt = await rerroToken.mint(scanner.address).then(tx => tx.wait());
    expect(receipt.events[0].event).to.equal('Transfer');
    
    // Capture the scanner's balance after minting
    const balanceAfter = await rerroToken.balanceOf(scanner.address);

    // Calculate the expected balance after minting
    const expectedBalanceAfter = balanceBefore.add(await rerroToken.defaultMintAmount());

    expect(balanceAfter).to.equal(expectedBalanceAfter);
  });

  it("mints via a meta-tx", async function() {
    const signer = this.accounts[2];
    const relayer = this.accounts[3];
    const scanner = this.accounts[4];
    const forwarder = this.forwarder.connect(relayer);
    const rerroToken = this.rerroToken;

    // Capture the scanner's balance before minting
    const balanceBefore = await rerroToken.balanceOf(scanner.address);

    const { request, signature } = await signMetaTxRequest(signer.provider, forwarder, {
      from: signer.address,
      to: rerroToken.address,
      data: rerroToken.interface.encodeFunctionData('mint', [scanner.address]),
    });

    await forwarder.execute(request, signature).then(tx => tx.wait());
    
    // Capture the scanner's balance after minting
    const balanceAfter = await rerroToken.balanceOf(scanner.address);

    // Calculate the expected balance after minting
    const expectedBalanceAfter = balanceBefore.add(await rerroToken.defaultMintAmount());

    expect(balanceAfter).to.equal(expectedBalanceAfter);
  });
});
