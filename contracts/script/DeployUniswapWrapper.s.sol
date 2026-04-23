// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {SwaperexUniswapV3FeeWrapper} from "../src/SwaperexUniswapV3FeeWrapper.sol";

/// @notice Broadcasts `SwaperexUniswapV3FeeWrapper` on Ethereum mainnet (or the forked chain selected by RPC).
/// @dev Required env: `FEE_RECIPIENT` (address), `FEE_BPS` (uint256, 1..1000).
///      Router and quoter are fixed to official Uniswap V3 mainnet deployments.
contract DeployUniswapWrapper is Script {
    address internal constant UNISWAP_V3_SWAP_ROUTER02 = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address internal constant UNISWAP_V3_QUOTER_V2 = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;

    function run() external returns (SwaperexUniswapV3FeeWrapper wrapper) {
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint256 feeBps256 = vm.envUint("FEE_BPS");
        if (feeBps256 == 0 || feeBps256 > 1_000) {
            revert("FEE_BPS must be between 1 and 1000 (contract MAX_FEE_BPS)");
        }
        // Casting to `uint16` is safe because `feeBps256` is checked to be at most 1000 (< 2^16).
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 feeBps = uint16(feeBps256);

        vm.startBroadcast();
        wrapper = new SwaperexUniswapV3FeeWrapper(UNISWAP_V3_SWAP_ROUTER02, UNISWAP_V3_QUOTER_V2, feeRecipient, feeBps);
        vm.stopBroadcast();

        console2.log("SwaperexUniswapV3FeeWrapper:", address(wrapper));
        console2.log("ROUTER (immutable):", address(wrapper.ROUTER()));
        console2.log("QUOTER (immutable):", address(wrapper.QUOTER()));
        console2.log("FEE_RECIPIENT (immutable):", address(wrapper.FEE_RECIPIENT()));
        console2.log("FEE_BPS (immutable):", uint256(wrapper.FEE_BPS()));
    }
}
