// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FeeMath} from "./libraries/FeeMath.sol";
import {IPancakeV3SwapRouter} from "./interfaces/IPancakeV3SwapRouter.sol";
import {IPancakeV3QuoterV2} from "./interfaces/IPancakeV3QuoterV2.sol";
import {IWBNB} from "./interfaces/IWBNB.sol";

/// @title SwaperexPancakeV3FeeWrapperV2
/// @notice BSC Pancake V3 `SwapRouter` only. Supports ERC20↔ERC20, native BNB→ERC20, and ERC20→native BNB.
/// @dev Fee is taken from **gross output** of the quoted swap (same `FeeMath` as v1). User receives net; treasury receives fee in the output asset (ERC20 or native).
/// @dev Recipient is always `msg.sender` (no third-party recipient / donation attacks).
contract SwaperexPancakeV3FeeWrapperV2 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Pancake V3 SwapRouter (immutable, single allowlisted router).
    address public immutable ROUTER;
    /// @notice Pancake V3 QuoterV2 (immutable).
    address public immutable QUOTER;
    /// @notice Canonical WBNB on BNB Chain (immutable).
    address public immutable WBNB;

    /// @notice Receives protocol fees (ERC20 or native).
    address public treasury;
    /// @notice Fee on gross output, basis points (1e4 = 100%). Mutable but capped by `MAX_FEE_BPS`.
    uint16 public feeBps;

    /// @notice Hard cap for `feeBps` (runtime updates cannot exceed this).
    uint16 public constant MAX_FEE_BPS = 1_000;

    error ZeroAddress();
    error SameToken();
    error FeeBps_Invalid();
    error NativeAmountMismatch();
    error NativeEth_NotExpected();
    error InvalidPath();
    error UnexpectedTokenOutBalance();
    error UnexpectedWbnbBalance();
    error UnexpectedEthBalance();
    error QuoterCallFailed();
    error ExpiredDeadline();
    error NetBelowMin();
    error EthSendFailed();

    event TreasuryUpdated(address indexed treasury);
    event FeeBpsUpdated(uint16 feeBps);
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 fee,
        address user,
        uint256 amountIn,
        uint256 amountOutGross,
        uint256 feeAmount,
        uint256 amountOutNet,
        bool nativeIn,
        bool nativeOut
    );

    constructor(
        address initialOwner,
        address router_,
        address quoter_,
        address wbnb_,
        address treasury_,
        uint16 feeBps_
    ) Ownable(initialOwner) {
        if (router_ == address(0) || quoter_ == address(0) || wbnb_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ == 0 || feeBps_ > MAX_FEE_BPS) revert FeeBps_Invalid();

        ROUTER = router_;
        QUOTER = quoter_;
        WBNB = wbnb_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    // --- Admin ---

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ == 0 || feeBps_ > MAX_FEE_BPS) revert FeeBps_Invalid();
        feeBps = feeBps_;
        emit FeeBpsUpdated(feeBps_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rescue stray ERC20 (does not include WBNB accounting for in-flight swaps — use only when paused / idle).
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    /// @notice Rescue stray native BNB on the wrapper.
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthSendFailed();
    }

    receive() external payable {
        // Accept native only via explicit swap entrypoints / WBNB unwrap; stray ETH can be rescued by owner.
    }

    // --- Quote (same QuoterV2 surface as v1; `tokenIn`/`tokenOut` use WBNB address for native legs) ---

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
        _validateQuotePair(tokenIn, tokenOut);

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

        feeAmount = FeeMath.feeOnGross(amountOutGross, feeBps);
        amountOutNet = amountOutGross - feeAmount;
    }

    // --- Swaps ---

    /// @notice ERC20 → ERC20 (same economics as v1). Output delivered to `msg.sender`.
    function swapExactInputSingleERC20(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != 0) revert NativeEth_NotExpected();
        if (deadline < block.timestamp) revert ExpiredDeadline();
        _validateErc20Pair(tokenIn, tokenOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

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

        (feeAmount, amountOutNet) = _feeSplit(amountOutGross);
        if (amountOutNet < amountOutMinNet) revert NetBelowMin();

        IERC20(tokenOut).safeTransfer(treasury, feeAmount);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOutNet);
        IERC20(tokenIn).forceApprove(ROUTER, 0);

        if (IERC20(tokenOut).balanceOf(address(this)) != balBefore) revert UnexpectedTokenOutBalance();

        emit SwapExecuted(tokenIn, tokenOut, fee, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, false, false);
    }

    /// @notice Native BNB → ERC20. `msg.value` must equal `amountIn`. Output delivered to `msg.sender` as ERC20.
    function swapExactInputSingleEthForTokens(
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != amountIn) revert NativeAmountMismatch();
        if (deadline < block.timestamp) revert ExpiredDeadline();
        if (tokenOut == address(0) || tokenOut == WBNB) revert InvalidPath();

        IWBNB(WBNB).deposit{value: amountIn}();
        IERC20(WBNB).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

        IPancakeV3SwapRouter.ExactInputSingleParams memory params = IPancakeV3SwapRouter.ExactInputSingleParams({
            tokenIn: WBNB,
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

        (feeAmount, amountOutNet) = _feeSplit(amountOutGross);
        if (amountOutNet < amountOutMinNet) revert NetBelowMin();

        IERC20(WBNB).forceApprove(ROUTER, 0);
        if (IERC20(WBNB).balanceOf(address(this)) != 0) revert UnexpectedWbnbBalance();

        IERC20(tokenOut).safeTransfer(treasury, feeAmount);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOutNet);

        if (IERC20(tokenOut).balanceOf(address(this)) != balBefore) revert UnexpectedTokenOutBalance();

        emit SwapExecuted(WBNB, tokenOut, fee, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, true, false);
    }

    /// @notice ERC20 → native BNB. Output delivered to `msg.sender` as BNB (net after fee).
    function swapExactInputSingleTokensForEth(
        address tokenIn,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != 0) revert NativeEth_NotExpected();
        if (deadline < block.timestamp) revert ExpiredDeadline();
        if (tokenIn == address(0) || tokenIn == WBNB) revert InvalidPath();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

        IPancakeV3SwapRouter.ExactInputSingleParams memory params = IPancakeV3SwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: WBNB,
            fee: fee,
            recipient: address(this),
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: grossMin,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        uint256 wbnbBefore = IERC20(WBNB).balanceOf(address(this));
        IPancakeV3SwapRouter(ROUTER).exactInputSingle(params);
        uint256 wbnbReceived = IERC20(WBNB).balanceOf(address(this)) - wbnbBefore;

        uint256 ethBefore = address(this).balance;
        IWBNB(WBNB).withdraw(wbnbReceived);
        // WBNB unwrap is 1:1 on BSC; do not use raw ETH balance delta (pre-existing ETH on the wrapper is allowed).
        amountOutGross = wbnbReceived;
        (feeAmount, amountOutNet) = _feeSplit(amountOutGross);
        if (amountOutNet < amountOutMinNet) revert NetBelowMin();

        IERC20(tokenIn).forceApprove(ROUTER, 0);
        if (IERC20(WBNB).balanceOf(address(this)) != wbnbBefore) revert UnexpectedWbnbBalance();

        (bool okFee,) = payable(treasury).call{value: feeAmount}("");
        if (!okFee) revert EthSendFailed();
        (bool okNet,) = payable(msg.sender).call{value: amountOutNet}("");
        if (!okNet) revert EthSendFailed();

        if (address(this).balance != ethBefore) revert UnexpectedEthBalance();

        emit SwapExecuted(tokenIn, WBNB, fee, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, false, true);
    }

    // --- Internal ---

    function _feeSplit(uint256 amountOutGross) internal view returns (uint256 feeAmount, uint256 amountOutNet) {
        feeAmount = FeeMath.feeOnGross(amountOutGross, feeBps);
        amountOutNet = amountOutGross - feeAmount;
    }

    function _validateErc20Pair(address tokenIn, address tokenOut) internal view {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == WBNB || tokenOut == WBNB) revert InvalidPath();
        if (tokenIn == tokenOut) revert SameToken();
    }

    function _validateQuotePair(address tokenIn, address tokenOut) internal pure {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert SameToken();
    }
}
