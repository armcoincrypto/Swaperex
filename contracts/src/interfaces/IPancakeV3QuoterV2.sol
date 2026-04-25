// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Pancake V3 `QuoterV2` `quoteExactInputSingle` tuple (matches Uniswap `IQuoterV2` layout).
/// @dev Official QuoterV2 is not `view`: it simulates `pool.swap` and decodes the swap-callback revert payload.
///      It must be invoked with a regular `CALL` (e.g. top-level `eth_call`), not `STATICCALL`, or simulation fails.
interface IPancakeV3QuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}
