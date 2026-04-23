// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV3QuoterV2} from "../../src/interfaces/IUniswapV3QuoterV2.sol";

/// @dev Returns a fixed `amountOut` for any quote (fork-free unit tests).
contract MockQuoterV2 is IUniswapV3QuoterV2 {
    uint256 public amountOutFixed;

    function setAmountOut(uint256 v) external {
        amountOutFixed = v;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory)
        external
        view
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)
    {
        return (amountOutFixed, 0, 0, 0);
    }
}
