// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPancakeV3SwapRouter} from "../../src/interfaces/IPancakeV3SwapRouter.sol";
import {SwaperexPancakeV3FeeWrapperV2} from "../../src/SwaperexPancakeV3FeeWrapperV2.sol";

/// @dev Calls back into the Pancake wrapper V2 during `exactInputSingle` to assert `nonReentrant` blocks nested swaps.
contract MockReentrantRouterPancakeV2 is IPancakeV3SwapRouter {
    SwaperexPancakeV3FeeWrapperV2 public wrapper;

    function setWrapper(SwaperexPancakeV3FeeWrapperV2 w_) external {
        wrapper = w_;
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
