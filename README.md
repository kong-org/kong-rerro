# KONG $RERRO

$RERRO is an ERC-20 that leverages ERC-2771 meta-transcations to relay transactions on behalf of chips. It's based on an adapted verison of the OpenZeppelin Minimal Forwarder.

## Testing

Have a HaLo chip and smartphone handy to run the tests which include an interactive component.

```
npx hardhat test
```

## Seeding Chips

Chips must be added to the contract. Create a `chipPublicKeys.txt` file with the raw, uncompressed chip public keys you would like to seed. Seeded chips can be claimed in a fully decentralized fashion.

```
npx hardhat run scripts/bulkSeed.js --network sepolia
```

## Deploying

You will need to include the `trustedForwarder` address from the deployment MinimalForwarded in the constructor along with an `arxChipSigner` address. The `arxChipSigner` is the address that was used to create certificates of every chip which should be publicly available (see `publicCert.js`).

After deployment you will not be able to mint chips until `setMintPausedState` is changed to `false`. See `pause.js` for a simple script to update this as well as the `setClaimOwnershipPausedState`.
