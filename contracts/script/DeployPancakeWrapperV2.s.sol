// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {SwaperexPancakeV3FeeWrapperV2} from "../src/SwaperexPancakeV3FeeWrapperV2.sol";

/// @notice Broadcasts `SwaperexPancakeV3FeeWrapperV2` on BSC (or the forked chain selected by RPC).
/// @dev Required env:
///      - `TREASURY` (address): receives protocol fees (ERC20 or native BNB).
///      - `FEE_BPS` (uint256): 1..1000 (must be <= `MAX_FEE_BPS`).
///      Optional:
///      - `OWNER` (address): defaults to `tx.origin` (the broadcasting EOA in typical `forge script` usage).
contract DeployPancakeWrapperV2 is Script {
    address internal constant PANCAKE_V3_SWAP_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    address internal constant PANCAKE_V3_QUOTER_V2 = 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997;
    address internal constant WBNB_BSC = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    function run() external returns (SwaperexPancakeV3FeeWrapperV2 wrapper) {
        address treasury = vm.envAddress("TREASURY");
        uint256 feeBps256 = vm.envUint("FEE_BPS");
        if (feeBps256 == 0 || feeBps256 > 1_000) {
            revert("FEE_BPS must be between 1 and 1000 (MAX_FEE_BPS)");
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 feeBps = uint16(feeBps256);

        address initialOwner = vm.envOr("OWNER", tx.origin);

        vm.startBroadcast();
        wrapper = new SwaperexPancakeV3FeeWrapperV2(
            initialOwner, PANCAKE_V3_SWAP_ROUTER, PANCAKE_V3_QUOTER_V2, WBNB_BSC, treasury, feeBps
        );
        vm.stopBroadcast();

        console2.log("SwaperexPancakeV3FeeWrapperV2:", address(wrapper));
        console2.log("OWNER:", wrapper.owner());
        console2.log("ROUTER (immutable):", address(wrapper.ROUTER()));
        console2.log("QUOTER (immutable):", address(wrapper.QUOTER()));
        console2.log("WBNB (immutable):", address(wrapper.WBNB()));
        console2.log("treasury:", wrapper.treasury());
        console2.log("feeBps:", uint256(wrapper.feeBps()));
    }
}
