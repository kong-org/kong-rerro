# KONG $RERRO

$RERRO is an ERC-20 that leverages ERC-2771 meta-transcations to relay transactions on behalf of chips. It's based on an adapted verison of the OpenZeppelin Minimal Forwarder.

## Testing

Have a HaLo chip and smartphone handy to run the tests which include an interactive component.

```
npx hardhat test
```

## Seeding Chips

Chips must be added to the contract. Create a `chipPublicKeys.txt` file with the raw, uncompressed chip public keys you would like to seed.

```
npx hardhat run scripts/bulkSeed.js --network sepolia
```