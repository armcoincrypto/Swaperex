// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Integer fee-on-gross helpers and inverse for Uniswap wrapper slippage.
library FeeMath {
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    error FeeBps_Invalid();
    error FeeMath_BoundTooLow();

    /// @dev feeAmount = floor(gross * feeBps / 10_000)
    function feeOnGross(uint256 gross, uint16 feeBps) internal pure returns (uint256 feeAmount) {
        feeAmount = (gross * uint256(feeBps)) / BPS_DENOMINATOR;
    }

    /// @dev net = gross - floor(gross * feeBps / 10_000)
    function netFromGross(uint256 gross, uint16 feeBps) internal pure returns (uint256 net) {
        uint256 f = feeOnGross(gross, feeBps);
        net = gross - f;
    }

    /// @notice Smallest gross `g` such that `netFromGross(g, feeBps) >= netMin`.
    /// @dev Used to convert user slippage on **net** into router `amountOutMinimum` on **gross**.
    function grossMinFromNetMin(uint256 netMin, uint16 feeBps) internal pure returns (uint256 gMin) {
        if (feeBps >= BPS_DENOMINATOR) revert FeeBps_Invalid();
        if (netMin == 0) return 0;

        uint256 denom = BPS_DENOMINATOR - uint256(feeBps);
        // Conservative upper bound: ceil(netMin * 10_000 / (10_000 - feeBps)) + slack for floor fee steps
        uint256 hi = (netMin * BPS_DENOMINATOR + denom - 1) / denom;
        unchecked {
            hi += 10;
        }
        if (hi < netMin) hi = netMin;

        if (netFromGross(hi, feeBps) < netMin) revert FeeMath_BoundTooLow();

        uint256 lo = netMin;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (netFromGross(mid, feeBps) >= netMin) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return lo;
    }
}
