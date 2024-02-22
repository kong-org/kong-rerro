const { expect } = require("chai").use(require('chai-as-promised'));
const { ethers } = require("hardhat");
const { signMetaTxRequest, buildTypedData, buildRequest } = require("../../src/signer");
const { relay } = require('../../action/index.js');

async function deploy(name, ...params) {
  const Contract = await ethers.getContractFactory(name);
  return await Contract.deploy(...params).then(f => f.deployed());
}

describe("RerroToken Relay Tests", function() {
  beforeEach(async function() {
    this.forwarder = await deploy('MinimalForwarder');
    this.rerroToken = await deploy("RerroToken", this.forwarder.address);    
    this.accounts = await ethers.getSigners();
    this.signer = this.accounts[2];
    this.scanner = this.accounts[3];
    await this.rerroToken.setMintPausedState(false);

    // Seed chips with a default mint amount
    await this.rerroToken.bulkSeed([this.accounts[1].address, this.accounts[2].address]);    
  });

  it("mints via a meta-tx", async function() {
    const { forwarder, rerroToken, signer, scanner } = this;

    // Capture the scanner's balance before minting
    const balanceBefore = await rerroToken.balanceOf(scanner.address);
    console.log(`balanceBefore: ${balanceBefore}`)

    // TODO: create interactive test where we sign using chip
    const { request, signature } = await signMetaTxRequest(signer.provider, forwarder, {
      from: signer.address,
      to: rerroToken.address,
      data: rerroToken.interface.encodeFunctionData('mint', [scanner.address]),
    });
    console.log(request);
    
    const requestObj = await buildRequest(forwarder, {
      to: rerroToken.address,
      data: rerroToken.interface.encodeFunctionData('mint', [scanner.address]),
    });
    console.log(requestObj);

    const toSign = await buildTypedData(forwarder, requestObj);
    console.log(toSign);

    const whitelist = [rerroToken.address]
    await relay(forwarder, request, signature, whitelist);

    // Capture the scanner's balance after minting
    const balanceAfter = await rerroToken.balanceOf(scanner.address);

    // Calculate the expected balance after minting
    const expectedBalanceAfter = balanceBefore.add(await rerroToken.defaultMintAmount());

    expect(balanceAfter).to.equal(expectedBalanceAfter);
  });

  it("refuses to send to non-whitelisted address", async function() {
    const { forwarder, rerroToken, signer, scanner } = this;

    const { request, signature } = await signMetaTxRequest(signer.provider, forwarder, {
      from: signer.address,
      to: rerroToken.address,
      data: rerroToken.interface.encodeFunctionData('mint', [scanner.address]),
    });
    
    const whitelist = [];
    await expect(
      relay(forwarder, request, signature, whitelist)
    ).to.be.rejectedWith(/rejected/i);
  });

  it("refuses to send incorrect signature", async function() {
    const { forwarder, rerroToken, signer, scanner } = this;

    const saltBytes = ethers.utils.randomBytes(32);
    const salt = ethers.utils.hexlify(saltBytes);

    const { request, signature } = await signMetaTxRequest(signer.provider, forwarder, {
      from: signer.address,
      to: rerroToken.address,
      data: rerroToken.interface.encodeFunctionData('mint', [scanner.address]),
      salt: salt,
    });

    const whitelist = [rerroToken.address]
    await relay(forwarder, request, signature, whitelist)

    const { request2, signature2 } = await signMetaTxRequest(signer.provider, forwarder, {
        from: signer.address,
        to: rerroToken.address,
        data: rerroToken.interface.encodeFunctionData('mint', [this.accounts[7].address]),
        salt: salt,
    });

    await relay(forwarder, request2, signature2, whitelist)
    console.log(`request2: ${request2}`)    

    await expect(
      relay(forwarder, request2, signature2, whitelist)
    ).to.be.rejectedWith(/invalid/i);
  });
});
