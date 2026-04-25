// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Pancake V3 `SwapRouter` `exactInputSingle` surface used by Swaperex wrapper.
/// @dev Matches Uniswap V3 periphery `SwapRouter` (includes `deadline` in params), **not** Uniswap `SwapRouter02`.
interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
