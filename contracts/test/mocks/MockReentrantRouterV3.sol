// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV3SwapRouter02} from "../../src/interfaces/IUniswapV3SwapRouter02.sol";
import {SwaperexUniswapV3FeeWrapperV3} from "../../src/SwaperexUniswapV3FeeWrapperV3.sol";

/// @dev Reenters wrapper V3 during `exactInput` to assert `nonReentrant` blocks nested swaps.
contract MockReentrantRouterV3 is IUniswapV3SwapRouter02 {
    SwaperexUniswapV3FeeWrapperV3 public wrapper;

    function setWrapper(SwaperexUniswapV3FeeWrapperV3 w) external {
        wrapper = w;
    }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256) {
        revert("MockReentrantRouterV3_exactInputSingle");
    }

    function exactInput(ExactInputParams calldata) external payable returns (uint256) {
        bytes memory emptyPath;
        wrapper.swapExactInputERC20(
            emptyPath, address(uint160(0x1111)), address(uint160(0x2222)), 1, 1, block.timestamp + 1 days
        );
        return 0;
    }
}
