// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Uniswap V3 `SwapRouter02` `exactInputSingle` surface used by Swaperex wrapper.
interface IUniswapV3SwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    /// @dev Uniswap `SwapRouter02` / `IV3SwapRouter` multi-hop exact input (no deadline in struct).
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}
