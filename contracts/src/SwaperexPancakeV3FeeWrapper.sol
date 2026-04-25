// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FeeMath} from "./libraries/FeeMath.sol";
import {IPancakeV3SwapRouter} from "./interfaces/IPancakeV3SwapRouter.sol";
import {IPancakeV3QuoterV2} from "./interfaces/IPancakeV3QuoterV2.sol";

/// @title SwaperexPancakeV3FeeWrapper
/// @notice v1: BSC Pancake V3 `SwapRouter` only, ERC20→ERC20, output-side fee. Immutable config.
/// @dev Pancake `SwapRouter` uses Uniswap-style `exactInputSingle` **with `deadline` in the router struct** (not `SwapRouter02`).
contract SwaperexPancakeV3FeeWrapper is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Pancake V3 SwapRouter (immutable).
    address public immutable ROUTER;
    /// @notice Pancake V3 QuoterV2 (immutable).
    address public immutable QUOTER;
    /// @notice Receives fee in `tokenOut`.
    address public immutable FEE_RECIPIENT;
    /// @notice Fee on gross output, basis points (1e4 = 100%).
    uint16 public immutable FEE_BPS;

    /// @notice Hard cap on `FEE_BPS` at deploy time (not runtime-tunable).
    uint16 public constant MAX_FEE_BPS = 1_000;

    /// @notice Some UIs use this sentinel for “native”; v1 does not support native BNB.
    address private constant NATIVE_SENTINEL = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    error NativeEth_NotSupported();
    error ZeroAddress();
    error SameToken();
    error FeeBps_Invalid();
    /// @dev Post-swap `tokenOut` balance must match the pre-router snapshot (no stranded proceeds; pre-existing dust allowed).
    error UnexpectedTokenOutBalance();
    error QuoterCallFailed();
    error ExpiredDeadline();
    error NetBelowMin();

    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 indexed fee,
        address sender,
        address recipient,
        uint256 amountIn,
        uint256 amountOutGross,
        uint256 feeAmount,
        uint256 amountOutNet
    );

    constructor(address router_, address quoter_, address feeRecipient_, uint16 feeBps_) {
        if (router_ == address(0) || quoter_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeBps_ == 0 || feeBps_ > MAX_FEE_BPS) revert FeeBps_Invalid();

        ROUTER = router_;
        QUOTER = quoter_;
        FEE_RECIPIENT = feeRecipient_;
        FEE_BPS = feeBps_;
    }

    /// @notice Quote gross from QuoterV2 and derive fee + net using the same math as `swapExactInputSingleERC20`.
    /// @dev Not `view`: QuoterV2 must be called with a normal `CALL` so the simulated `pool.swap` can run under
    ///      try/catch (see Uniswap-style `QuoterV2.sol`). Use top-level `eth_call` off-chain; do not `STATICCALL` this.
    function quoteExactInputSingleERC20(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    )
        external
        returns (
            uint256 amountOutGross,
            uint256 feeAmount,
            uint256 amountOutNet,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        )
    {
        _validatePair(tokenIn, tokenOut);

        IPancakeV3QuoterV2.QuoteExactInputSingleParams memory qParams = IPancakeV3QuoterV2.QuoteExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, amountIn: amountIn, fee: fee, sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        bytes memory callData = abi.encodeWithSelector(IPancakeV3QuoterV2.quoteExactInputSingle.selector, qParams);
        (bool ok, bytes memory ret) = QUOTER.call(callData);
        if (!ok) {
            if (ret.length == 0) revert QuoterCallFailed();
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }

        (amountOutGross, sqrtPriceX96After, initializedTicksCrossed, gasEstimate) =
            abi.decode(ret, (uint256, uint160, uint32, uint256));

        feeAmount = FeeMath.feeOnGross(amountOutGross, FEE_BPS);
        amountOutNet = amountOutGross - feeAmount;
    }

    /// @param amountOutMinNet Minimum `tokenOut` the `recipient` receives after fee (slippage on net).
    function swapExactInputSingleERC20(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != 0) revert NativeEth_NotSupported();
        if (deadline < block.timestamp) revert ExpiredDeadline();
        if (recipient == address(0)) revert ZeroAddress();
        _validatePair(tokenIn, tokenOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, FEE_BPS);

        IPancakeV3SwapRouter.ExactInputSingleParams memory params = IPancakeV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: grossMin,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        IPancakeV3SwapRouter(ROUTER).exactInputSingle(params);
        amountOutGross = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        feeAmount = FeeMath.feeOnGross(amountOutGross, FEE_BPS);
        amountOutNet = amountOutGross - feeAmount;

        if (amountOutNet < amountOutMinNet) revert NetBelowMin();

        IERC20(tokenOut).safeTransfer(FEE_RECIPIENT, feeAmount);
        IERC20(tokenOut).safeTransfer(recipient, amountOutNet);
        IERC20(tokenIn).forceApprove(ROUTER, 0);

        // Allow pre-existing `tokenOut` dust (permissionless grief in v1); require no *new* residue from this swap.
        if (IERC20(tokenOut).balanceOf(address(this)) != balBefore) revert UnexpectedTokenOutBalance();

        emit SwapExecuted(
            tokenIn, tokenOut, fee, msg.sender, recipient, amountIn, amountOutGross, feeAmount, amountOutNet
        );
    }

    function _validatePair(address tokenIn, address tokenOut) internal pure {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == NATIVE_SENTINEL || tokenOut == NATIVE_SENTINEL) revert NativeEth_NotSupported();
        if (tokenIn == tokenOut) revert SameToken();
    }
}
