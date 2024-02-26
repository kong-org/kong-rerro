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

## Mint Chips with Certificates

As an alternative to seeding chips -- which can incur significant gas costs -- one may also mint using a signature or certificate. This certificate indicates inclusion in the group of valid chips. For a small number of chips these certificates can be stored locally (for instance in a frontend). In the case of $RERRO token there are a significant number of chips and as such we created a public Supabase database where certificates can be looked up against a hash of the chip's public key.

## Metatransactions

The $RERRO token integrates ERC2771 meta transactions allowing for subsidized mints and claims. This is accomplished through an OpenZeppelin Actions and Relay; see `action/index.js` for this code. Importantly, $RERRO uses a non-standard minimal forwarder that changes some of the parameters used in a typical forwarded. Please note that the forwarder contract is unaudited.

Use the `relayMint.js` script to test this functionality on testnet.

## Deploying

You will need to include the `trustedForwarder` address from the deployment MinimalForwarded in the constructor along with an `arxChipSigner` address. The `arxChipSigner` is the address that was used to create certificates of every chip which should be publicly available (see `publicCert.js`).

After deployment you will not be able to mint chips until `setMintPausedState` is changed to `false`. See `pause.js` for a simple script to update this as well as the `setClaimOwnershipPausedState`.
