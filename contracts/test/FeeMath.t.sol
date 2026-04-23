// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";

contract FeeMathTest is Test {
    function test_feeOnGross_floor() public pure {
        assertEq(FeeMath.feeOnGross(10_000, 100), 100);
        assertEq(FeeMath.feeOnGross(9_999, 100), 99);
    }

    function test_netFromGross() public pure {
        assertEq(FeeMath.netFromGross(10_000, 100), 9_900);
    }

    function test_grossMinFromNetMin_zero() public pure {
        assertEq(FeeMath.grossMinFromNetMin(0, 100), 0);
    }

    function test_grossMinFromNetMin_inverse(uint256 netMin, uint16 feeBps) public pure {
        feeBps = uint16(bound(uint256(feeBps), 1, 9_999));
        netMin = bound(netMin, 0, type(uint128).max);

        uint256 g = FeeMath.grossMinFromNetMin(netMin, feeBps);
        assertTrue(FeeMath.netFromGross(g, feeBps) >= netMin);
        if (g > 0) {
            assertTrue(FeeMath.netFromGross(g - 1, feeBps) < netMin);
        }
    }

    function test_grossMinFromNetMin_known_1pct() public pure {
        uint256 g = FeeMath.grossMinFromNetMin(99, 100);
        assertEq(FeeMath.netFromGross(g, 100), 99);
    }

    function test_feeBps_invalid_reverts() public {
        vm.expectRevert(FeeMath.FeeBps_Invalid.selector);
        this._grossMinExternal(1, 10_000);
    }

    function _grossMinExternal(uint256 netMin, uint16 feeBps) external pure {
        FeeMath.grossMinFromNetMin(netMin, feeBps);
    }

    function test_feeMath_boundary_maxFee() public pure {
        uint256 g = FeeMath.grossMinFromNetMin(1, 9_999);
        assertTrue(FeeMath.netFromGross(g, 9_999) >= 1);
    }
}
