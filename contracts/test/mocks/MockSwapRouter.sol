// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

import {IUniswapV3SwapRouter02} from "../../src/interfaces/IUniswapV3SwapRouter02.sol";

/// @dev Pulls `tokenIn`, mints `grossOut` of `tokenOut` to `recipient` (must be >= `amountOutMinimum`).
contract MockSwapRouter is IUniswapV3SwapRouter02 {
    using SafeERC20 for IERC20;

    uint256 public grossOut;

    function setGrossOut(uint256 grossOut_) external {
        grossOut = grossOut_;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        IERC20(p.tokenIn).safeTransferFrom(msg.sender, address(this), p.amountIn);
        if (grossOut < p.amountOutMinimum) revert("MockRouter_Slippage");
        ERC20Mock(p.tokenOut).mint(p.recipient, grossOut);
        return grossOut;
    }
}
