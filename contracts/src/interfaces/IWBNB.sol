// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal WBNB surface used by SwaperexPancakeV3FeeWrapperV2.
interface IWBNB is IERC20 {
    function deposit() external payable;

    function withdraw(uint256 amount) external;
}
