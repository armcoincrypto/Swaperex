// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

import {IPancakeV3SwapRouter} from "../../src/interfaces/IPancakeV3SwapRouter.sol";

import {MockWBNB} from "./MockWBNB.sol";

/// @dev Router double supporting ERC20 paths and WBNB legs for wrapper V2 tests.
contract MockPancakeSwapRouterV2 is IPancakeV3SwapRouter {
    using SafeERC20 for IERC20;

    address public wbnb;
    uint256 public grossOut;

    constructor(address wbnb_) {
        wbnb = wbnb_;
    }

    function setGrossOut(uint256 grossOut_) external {
        grossOut = grossOut_;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        if (p.tokenIn == wbnb) {
            IERC20(wbnb).safeTransferFrom(msg.sender, address(this), p.amountIn);
        } else {
            IERC20(p.tokenIn).safeTransferFrom(msg.sender, address(this), p.amountIn);
        }

        if (grossOut < p.amountOutMinimum) revert("MockRouter_Slippage");

        if (p.tokenOut == wbnb) {
            MockWBNB(wbnb).mint(p.recipient, grossOut);
        } else {
            ERC20Mock(p.tokenOut).mint(p.recipient, grossOut);
        }
        return grossOut;
    }
}
