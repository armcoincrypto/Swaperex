// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal WBNB double for unit tests (deposit / withdraw + test mint).
contract MockWBNB is ERC20 {
    constructor() ERC20("Wrapped BNB", "WBNB") {}

    /// @dev Test helper — not present on mainnet WBNB.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "MockWBNB_withdraw");
    }
}
