// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";

import {SwaperexUniswapV3FeeWrapperV3} from "../src/SwaperexUniswapV3FeeWrapperV3.sol";

/// @notice Broadcasts `SwaperexUniswapV3FeeWrapperV3` on Ethereum (or the forked chain selected by RPC).
/// @dev Required env:
///      - `UNISWAP_V3_SWAP_ROUTER02` — SwapRouter02
///      - `UNISWAP_V3_QUOTER_V2` — QuoterV2
///      - `WETH` — canonical WETH on the target chain
///      - `TREASURY` — receives protocol fees (ERC20)
///      - `FEE_BPS` (uint256): 1..1000 (must be <= `MAX_FEE_BPS`)
///      Optional:
///      - `OWNER` — defaults to `tx.origin` (broadcasting EOA in typical `forge script` usage)
///      Signer: pass `--private-key "$PRIVATE_KEY"` (or ledger / aws) to `forge script`; not read in-script.
contract DeployUniswapWrapperV3 is Script {
    function run() external returns (SwaperexUniswapV3FeeWrapperV3 wrapper) {
        address router = vm.envAddress("UNISWAP_V3_SWAP_ROUTER02");
        address quoter = vm.envAddress("UNISWAP_V3_QUOTER_V2");
        address weth = vm.envAddress("WETH");
        address treasury = vm.envAddress("TREASURY");

        uint256 feeBps256 = vm.envUint("FEE_BPS");
        if (feeBps256 == 0 || feeBps256 > 1_000) {
            revert("FEE_BPS must be between 1 and 1000 (MAX_FEE_BPS)");
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 feeBps = uint16(feeBps256);

        address initialOwner = vm.envOr("OWNER", tx.origin);

        vm.startBroadcast();
        wrapper = new SwaperexUniswapV3FeeWrapperV3(initialOwner, router, quoter, weth, treasury, feeBps);
        vm.stopBroadcast();

        console2.log("SwaperexUniswapV3FeeWrapperV3:", address(wrapper));
        console2.log("OWNER:", wrapper.owner());
        console2.log("ROUTER (immutable):", address(wrapper.ROUTER()));
        console2.log("QUOTER (immutable):", address(wrapper.QUOTER()));
        console2.log("WETH (immutable):", address(wrapper.WETH()));
        console2.log("MAX_HOPS:", wrapper.MAX_HOPS());
        console2.log("treasury:", wrapper.treasury());
        console2.log("feeBps:", uint256(wrapper.feeBps()));
    }
}
