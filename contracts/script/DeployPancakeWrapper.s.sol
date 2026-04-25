// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {SwaperexPancakeV3FeeWrapper} from "../src/SwaperexPancakeV3FeeWrapper.sol";

/// @notice Broadcasts `SwaperexPancakeV3FeeWrapper` on BSC (or the forked chain selected by RPC).
/// @dev Required env: `FEE_RECIPIENT` (address), `FEE_BPS` (uint256, 1..1000).
///      Router and quoter are fixed to official Pancake V3 BSC mainnet deployments.
contract DeployPancakeWrapper is Script {
    address internal constant PANCAKE_V3_SWAP_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address internal constant PANCAKE_V3_QUOTER_V2 = 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997;

    function run() external returns (SwaperexPancakeV3FeeWrapper wrapper) {
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        uint256 feeBps256 = vm.envUint("FEE_BPS");
        if (feeBps256 == 0 || feeBps256 > 1_000) {
            revert("FEE_BPS must be between 1 and 1000 (contract MAX_FEE_BPS)");
        }
        // Casting to `uint16` is safe because `feeBps256` is checked to be at most 1000 (< 2^16).
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 feeBps = uint16(feeBps256);

        vm.startBroadcast();
        wrapper = new SwaperexPancakeV3FeeWrapper(PANCAKE_V3_SWAP_ROUTER, PANCAKE_V3_QUOTER_V2, feeRecipient, feeBps);
        vm.stopBroadcast();

        console2.log("SwaperexPancakeV3FeeWrapper:", address(wrapper));
        console2.log("ROUTER (immutable):", address(wrapper.ROUTER()));
        console2.log("QUOTER (immutable):", address(wrapper.QUOTER()));
        console2.log("FEE_RECIPIENT (immutable):", address(wrapper.FEE_RECIPIENT()));
        console2.log("FEE_BPS (immutable):", uint256(wrapper.FEE_BPS()));
    }
}
