// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUniswapV3SwapRouter02} from "../../src/interfaces/IUniswapV3SwapRouter02.sol";
import {SwaperexUniswapV3FeeWrapperV2} from "../../src/SwaperexUniswapV3FeeWrapperV2.sol";

/// @dev Calls back into wrapper V2 during `exactInputSingle` to assert `nonReentrant` blocks nested swaps.
contract MockReentrantRouterV2 is IUniswapV3SwapRouter02 {
    SwaperexUniswapV3FeeWrapperV2 public wrapper;

    function setWrapper(SwaperexUniswapV3FeeWrapperV2 w) external {
        wrapper = w;
    }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256) {
        wrapper.swapExactInputSingleERC20(
            address(uint160(0x1111)),
            address(uint160(0x2222)),
            3000,
            1,
            1,
            block.timestamp + 1 days,
            0
        );
        return 0;
    }
}
