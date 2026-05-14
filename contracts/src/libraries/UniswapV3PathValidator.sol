// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title UniswapV3PathValidator
/// @notice Validates Uniswap V3 packed paths: `token (20) | uint24 fee | token (20) | ...`.
library UniswapV3PathValidator {
    uint256 internal constant ADDR_BYTES = 20;
    uint256 internal constant FEE_BYTES = 3;
    uint256 internal constant SEGMENT = ADDR_BYTES + FEE_BYTES; // token + fee to next hop

    error Path_InvalidLength();
    error Path_MaxHopsExceeded(uint256 hops, uint256 maxHops);
    error Path_TokenMismatch();
    error Path_FeeNotAllowed(uint24 fee);
    error Path_ZeroAddress();
    error Path_TokenRepeated();

    /// @notice Allowed Uniswap V3 pool fee tiers (hundredths of a bip).
    function isAllowedFee(uint24 fee) internal pure returns (bool) {
        return fee == 100 || fee == 500 || fee == 3000 || fee == 10_000;
    }

    /// @dev Number of pools in `path` (one less than number of tokens).
    function numHops(bytes calldata path) internal pure returns (uint256 hops) {
        if (path.length < ADDR_BYTES + FEE_BYTES + ADDR_BYTES) revert Path_InvalidLength();
        if ((path.length - ADDR_BYTES) % SEGMENT != 0) revert Path_InvalidLength();
        hops = (path.length - ADDR_BYTES) / SEGMENT;
    }

    /// @notice First token in the path (offset 0).
    function firstToken(bytes calldata path) internal pure returns (address token) {
        token = _readAddress(path, 0);
    }

    /// @notice Last token in the path (final 20 bytes).
    function lastToken(bytes calldata path) internal pure returns (address token) {
        if (path.length < ADDR_BYTES + FEE_BYTES + ADDR_BYTES) revert Path_InvalidLength();
        token = _readAddress(path, path.length - ADDR_BYTES);
    }

    /// @notice Fee tier of the first pool in the path (bytes [20:23]).
    function firstPoolFee(bytes calldata path) internal pure returns (uint24 fee) {
        if (path.length < ADDR_BYTES + FEE_BYTES + ADDR_BYTES) revert Path_InvalidLength();
        fee = _readUint24(path, ADDR_BYTES);
    }

    /// @param maxHops Maximum number of pools (e.g. 2 => at most three tokens).
    /// @param tokenIn Must equal first token in path.
    /// @param tokenOut Must equal last token in path.
    /// @dev Reverts if any token address is zero, any fee is not in the allowlist, or any token repeats (no cycles).
    function validate(bytes calldata path, address tokenIn, address tokenOut, uint256 maxHops) internal pure {
        uint256 hops = numHops(path);
        if (hops > maxHops) revert Path_MaxHopsExceeded(hops, maxHops);

        address first = firstToken(path);
        address last = lastToken(path);
        if (first != tokenIn || last != tokenOut) revert Path_TokenMismatch();
        if (first == address(0) || last == address(0)) revert Path_ZeroAddress();

        address[] memory tokens = new address[](hops + 1);
        tokens[0] = first;

        uint256 offset = ADDR_BYTES;
        for (uint256 i = 0; i < hops; i++) {
            uint24 fee = _readUint24(path, offset);
            if (!isAllowedFee(fee)) revert Path_FeeNotAllowed(fee);
            offset += FEE_BYTES;

            address nxt = _readAddress(path, offset);
            if (nxt == address(0)) revert Path_ZeroAddress();

            for (uint256 j = 0; j <= i; j++) {
                if (tokens[j] == nxt) revert Path_TokenRepeated();
            }
            tokens[i + 1] = nxt;
            offset += ADDR_BYTES;
        }

        if (tokens[hops] != last) revert Path_TokenMismatch();
    }

    function _readAddress(bytes calldata path, uint256 byteOffset) private pure returns (address a) {
        assembly ("memory-safe") {
            a := shr(96, calldataload(add(path.offset, byteOffset)))
        }
    }

    function _readUint24(bytes calldata path, uint256 byteOffset) private pure returns (uint24 f) {
        assembly ("memory-safe") {
            f := shr(232, calldataload(add(path.offset, byteOffset)))
        }
    }
}
