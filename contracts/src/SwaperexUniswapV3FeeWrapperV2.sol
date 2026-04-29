// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FeeMath} from "./libraries/FeeMath.sol";
import {IUniswapV3SwapRouter02} from "./interfaces/IUniswapV3SwapRouter02.sol";
import {IUniswapV3QuoterV2} from "./interfaces/IUniswapV3QuoterV2.sol";
import {IWETH} from "./interfaces/IWETH.sol";

/// @title SwaperexUniswapV3FeeWrapperV2
/// @notice Ethereum Uniswap V3 `SwapRouter02` wrapper: ERC20↔ERC20, ETH→ERC20, ERC20→ETH.
/// @dev Fee on gross output (`FeeMath`); net to `msg.sender`; treasury receives fee. No arbitrary recipient.
contract SwaperexUniswapV3FeeWrapperV2 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable ROUTER;
    address public immutable QUOTER;
    address public immutable WETH;

    address public treasury;
    uint16 public feeBps;

    uint16 public constant MAX_FEE_BPS = 1_000;

    error NativeEth_NotSupported();
    error InvalidMsgValue();
    error InvalidTreasury();
    error InvalidFeeBps();
    error DeadlineExpired();
    error SlippageExceeded();
    error EthSendFailed();
    error UnexpectedWethBalance();
    error UnexpectedEthBalance();
    error SameToken();
    error ZeroAmount();
    error ZeroAddress();
    error QuoterCallFailed();
    error UnexpectedTokenOutBalance();

    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 indexed fee,
        address user,
        uint256 amountIn,
        uint256 amountOutGross,
        uint256 feeAmount,
        uint256 amountOutNet,
        bool nativeIn,
        bool nativeOut
    );
    event TreasuryUpdated(address indexed treasury);
    event FeeBpsUpdated(uint16 feeBps);
    event RescueToken(address indexed token, address indexed to, uint256 amount);
    event RescueETH(address indexed to, uint256 amount);
    /// @notice Observability: native ETH received outside explicit swap entrypoints (donations / mis-sends).
    event UnexpectedETHReceived(address indexed sender, uint256 amount);

    constructor(address initialOwner, address router_, address quoter_, address weth_, address treasury_, uint16 feeBps_)
        Ownable(initialOwner)
    {
        if (router_ == address(0) || quoter_ == address(0) || weth_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (feeBps_ == 0 || feeBps_ > MAX_FEE_BPS) revert InvalidFeeBps();

        ROUTER = router_;
        QUOTER = quoter_;
        WETH = weth_;
        treasury = treasury_;
        feeBps = feeBps_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert InvalidTreasury();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ == 0 || feeBps_ > MAX_FEE_BPS) revert InvalidFeeBps();
        feeBps = feeBps_;
        emit FeeBpsUpdated(feeBps_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner-only ERC20 rescue when paused / idle.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit RescueToken(token, to, amount);
    }

    /// @notice Owner-only ETH rescue when paused / idle.
    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthSendFailed();
        emit RescueETH(to, amount);
    }

    receive() external payable {
        // WETH.unwrap sends ETH with `msg.sender == WETH` — do not log normal ERC20→ETH flow.
        if (msg.value > 0 && msg.sender != WETH) {
            emit UnexpectedETHReceived(msg.sender, msg.value);
        }
    }

    /// @notice Quote gross via QuoterV2; apply protocol fee on gross to get net. Use WETH for native legs.
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
        if (amountIn == 0) revert ZeroAmount();
        _validateQuotePair(tokenIn, tokenOut);

        IUniswapV3QuoterV2.QuoteExactInputSingleParams memory qParams = IUniswapV3QuoterV2.QuoteExactInputSingleParams({
            tokenIn: tokenIn, tokenOut: tokenOut, amountIn: amountIn, fee: fee, sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        bytes memory callData = abi.encodeWithSelector(IUniswapV3QuoterV2.quoteExactInputSingle.selector, qParams);
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

    /// @notice ERC20 → ERC20. Output to `msg.sender` only.
    function swapExactInputSingleERC20(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != 0) revert InvalidMsgValue();
        if (amountIn == 0) revert ZeroAmount();
        if (deadline < block.timestamp) revert DeadlineExpired();
        _validateErc20Pair(tokenIn, tokenOut);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

        IUniswapV3SwapRouter02.ExactInputSingleParams memory params = IUniswapV3SwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: grossMin,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV3SwapRouter02(ROUTER).exactInputSingle(params);
        amountOutGross = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        (feeAmount, amountOutNet) = _feeSplit(amountOutGross);
        if (amountOutNet < amountOutMinNet) revert SlippageExceeded();

        IERC20(tokenOut).safeTransfer(treasury, feeAmount);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOutNet);
        IERC20(tokenIn).forceApprove(ROUTER, 0);

        if (IERC20(tokenOut).balanceOf(address(this)) != balBefore) revert UnexpectedTokenOutBalance();

        emit SwapExecuted(tokenIn, tokenOut, fee, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, false, false);
    }

    /// @notice ETH → ERC20. `msg.value` must equal `amountIn`.
    function swapExactInputSingleEthForTokens(
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != amountIn) revert InvalidMsgValue();
        if (amountIn == 0) revert ZeroAmount();
        if (deadline < block.timestamp) revert DeadlineExpired();
        if (tokenOut == address(0) || tokenOut == WETH) revert NativeEth_NotSupported();

        IWETH(WETH).deposit{value: amountIn}();
        IERC20(WETH).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

        IUniswapV3SwapRouter02.ExactInputSingleParams memory params = IUniswapV3SwapRouter02.ExactInputSingleParams({
            tokenIn: WETH,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: grossMin,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV3SwapRouter02(ROUTER).exactInputSingle(params);
        amountOutGross = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        (feeAmount, amountOutNet) = _feeSplit(amountOutGross);
        if (amountOutNet < amountOutMinNet) revert SlippageExceeded();

        IERC20(WETH).forceApprove(ROUTER, 0);
        if (IERC20(WETH).balanceOf(address(this)) != 0) revert UnexpectedWethBalance();

        IERC20(tokenOut).safeTransfer(treasury, feeAmount);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOutNet);

        if (IERC20(tokenOut).balanceOf(address(this)) != balBefore) revert UnexpectedTokenOutBalance();

        emit SwapExecuted(WETH, tokenOut, fee, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, true, false);
    }

    /// @notice ERC20 → ETH. Net ETH to `msg.sender`; fee ETH to treasury.
    function swapExactInputSingleTokensForEth(
        address tokenIn,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant whenNotPaused returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet) {
        if (msg.value != 0) revert InvalidMsgValue();
        if (amountIn == 0) revert ZeroAmount();
        if (deadline < block.timestamp) revert DeadlineExpired();
        if (tokenIn == address(0) || tokenIn == WETH) revert NativeEth_NotSupported();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

        IUniswapV3SwapRouter02.ExactInputSingleParams memory params = IUniswapV3SwapRouter02.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: WETH,
            fee: fee,
            recipient: address(this),
            amountIn: amountIn,
            amountOutMinimum: grossMin,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });

        uint256 wethBefore = IERC20(WETH).balanceOf(address(this));
        IUniswapV3SwapRouter02(ROUTER).exactInputSingle(params);
        uint256 wethReceived = IERC20(WETH).balanceOf(address(this)) - wethBefore;

        uint256 ethBefore = address(this).balance;
        IWETH(WETH).withdraw(wethReceived);
        amountOutGross = wethReceived;
        (feeAmount, amountOutNet) = _feeSplit(amountOutGross);
        if (amountOutNet < amountOutMinNet) revert SlippageExceeded();

        IERC20(tokenIn).forceApprove(ROUTER, 0);
        if (IERC20(WETH).balanceOf(address(this)) != wethBefore) revert UnexpectedWethBalance();

        (bool okFee,) = payable(treasury).call{value: feeAmount}("");
        if (!okFee) revert EthSendFailed();
        (bool okNet,) = payable(msg.sender).call{value: amountOutNet}("");
        if (!okNet) revert EthSendFailed();

        if (address(this).balance != ethBefore) revert UnexpectedEthBalance();

        emit SwapExecuted(tokenIn, WETH, fee, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, false, true);
    }

    function _feeSplit(uint256 amountOutGross) internal view returns (uint256 feeAmount, uint256 amountOutNet) {
        feeAmount = FeeMath.feeOnGross(amountOutGross, feeBps);
        amountOutNet = amountOutGross - feeAmount;
    }

    function _validateErc20Pair(address tokenIn, address tokenOut) internal view {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == WETH || tokenOut == WETH) revert NativeEth_NotSupported();
        if (tokenIn == tokenOut) revert SameToken();
    }

    function _validateQuotePair(address tokenIn, address tokenOut) internal pure {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert SameToken();
    }
}
