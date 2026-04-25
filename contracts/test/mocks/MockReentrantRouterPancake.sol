// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPancakeV3SwapRouter} from "../../src/interfaces/IPancakeV3SwapRouter.sol";
import {SwaperexPancakeV3FeeWrapper} from "../../src/SwaperexPancakeV3FeeWrapper.sol";

/// @dev Calls back into the Pancake wrapper during `exactInputSingle` to assert `nonReentrant` blocks nested swaps.
contract MockReentrantRouterPancake is IPancakeV3SwapRouter {
    SwaperexPancakeV3FeeWrapper public wrapper;

    function setWrapper(SwaperexPancakeV3FeeWrapper w) external {
        wrapper = w;
    }

    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256) {
        // Second entry must fail inside `nonReentrant` before any inner logic.
        wrapper.swapExactInputSingleERC20(
            address(uint160(0x1111)),
            address(uint160(0x2222)),
            3000,
            address(uint160(0x3333)),
            1,
            1,
            block.timestamp + 1 days,
            0
        );
        return 0;
    }
}
