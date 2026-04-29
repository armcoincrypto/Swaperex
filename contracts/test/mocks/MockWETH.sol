// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

/// @dev Minimal WETH9-like mock for unit tests (deposit mints WETH; withdraw burns and sends ETH).
contract MockWETH is ERC20Mock {
    constructor() ERC20Mock() {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "MockWETH_Withdraw");
    }
}
