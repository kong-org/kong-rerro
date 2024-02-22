// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.9.0) (metatx/MinimalForwarder.sol)

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @dev Simple minimal forwarder to be used together with an ERC2771 compatible contract. See {ERC2771Context}.
 *
 * MinimalForwarder is mainly meant for testing, as it is missing features to be a good production-ready forwarder. This
 * contract does not intend to have all the properties that are needed for a sound forwarding system. A fully
 * functioning forwarding system with good properties requires more complexity. We suggest you look at other projects
 * such as the GSN which do have the goal of building a system like that.
 */
contract MinimalForwarder is EIP712 {
    using ECDSA for bytes32;

    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 salt;
        bytes data;
    }

    // Included for demonstrative purposes, this is what we actually sign -- without `from`
    // struct ForwardRequestSig {
    //     address to;
    //     uint256 value;
    //     uint256 gas;
    //     uint256 salt;
    //     bytes data;
    // }

    // Note that `from` has been removed from the request
    bytes32 private constant _TYPEHASH =
        keccak256("ForwardRequest(address to,uint256 value,uint256 gas,uint256 salt,bytes data)");

    mapping(address => mapping(uint256 => bool)) private _usedSalts;

    constructor() EIP712("MinimalForwarder", "0.0.2") {}

    function checkSalt(address from, uint256 salt) public view returns (bool) {
        return _usedSalts[from][salt];
    }

    function verify(ForwardRequest calldata req, bytes calldata signature) public view returns (bool) {
        // Note: what we are verifying here is the `ForwardRequestSig` struct commented out above
        address signer = _hashTypedDataV4(
            keccak256(abi.encode(_TYPEHASH, req.to, req.value, req.gas, req.salt, keccak256(req.data)))
        ).recover(signature);
        
        // Check if the salt has been used before.
        bool saltUsed = _usedSalts[req.from][req.salt];
        return !saltUsed && signer == req.from;
    }

    function execute(
        ForwardRequest calldata req,
        bytes calldata signature // See ForwardRequestSig for what we've actually signed 
    ) public payable returns (bool, bytes memory) {
        require(verify(req, signature), "MinimalForwarder: signature does not match request");
        // Store the salt for this `from` + `salt` pair, to prevent replay attacks.
        _usedSalts[req.from][req.salt] = true;

        (bool success, bytes memory returndata) = req.to.call{gas: req.gas, value: req.value}(
            abi.encodePacked(req.data, req.from)
        );

        // Validate that the relayer has sent enough gas for the call.
        // See https://ronan.eth.limo/blog/ethereum-gas-dangers/
        if (gasleft() <= req.gas / 63) {
            // We explicitly trigger invalid opcode to consume all gas and bubble-up the effects, since
            // neither revert or assert consume all gas since Solidity 0.8.0
            // https://docs.soliditylang.org/en/v0.8.0/control-structures.html#panic-via-assert-and-error-via-require
            /// @solidity memory-safe-assembly
            assembly {
                invalid()
            }
        }

        return (success, returndata);
    }
}