// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FeeMath} from "./libraries/FeeMath.sol";
import {UniswapV3PathValidator} from "./libraries/UniswapV3PathValidator.sol";
import {IUniswapV3SwapRouter02} from "./interfaces/IUniswapV3SwapRouter02.sol";
import {IUniswapV3QuoterV2} from "./interfaces/IUniswapV3QuoterV2.sol";

/// @title SwaperexUniswapV3FeeWrapperV3
/// @notice Ethereum Uniswap V3 `SwapRouter02` wrapper: multi-hop ERC20→ERC20 via `exactInput` / `quoteExactInput`.
/// @dev Fee on gross terminal output (`FeeMath`); net to `msg.sender`; treasury receives fee. Recipient on router is always `address(this)`.
///      `msg.value` must be zero (native ETH deposit/unwrap flows are a separate future entrypoint). `WETH` is allowed as a normal ERC20 leg/endpoint.
contract SwaperexUniswapV3FeeWrapperV3 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Maximum pools per path (initial rollout: 2 hops).
    uint256 public constant MAX_HOPS = 2;

    address public immutable ROUTER;
    address public immutable QUOTER;
    address public immutable WETH;

    address public treasury;
    uint16 public feeBps;

    uint16 public constant MAX_FEE_BPS = 1_000;

    error InvalidMsgValue();
    error InvalidTreasury();
    error InvalidFeeBps();
    error DeadlineExpired();
    error SlippageExceeded();
    error ZeroAmount();
    error ZeroAddress();
    error SameToken();
    error QuoterCallFailed();
    error UnexpectedTokenOutBalance();
    error EthSendFailed();

    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 indexed feeFirst,
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
    event UnexpectedETHReceived(address indexed sender, uint256 amount);

    constructor(
        address initialOwner,
        address router_,
        address quoter_,
        address weth_,
        address treasury_,
        uint16 feeBps_
    ) Ownable(initialOwner) {
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

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit RescueToken(token, to, amount);
    }

    function rescueETH(address payable to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthSendFailed();
        emit RescueETH(to, amount);
    }

    receive() external payable {
        if (msg.value > 0 && msg.sender != WETH) {
            emit UnexpectedETHReceived(msg.sender, msg.value);
        }
    }

    /// @notice Quote gross via QuoterV2 `quoteExactInput`; apply protocol fee on gross to get net.
    function quoteExactInputERC20(bytes calldata path, address tokenIn, address tokenOut, uint256 amountIn)
        external
        returns (
            uint256 amountOutGross,
            uint256 feeAmount,
            uint256 amountOutNet,
            uint160[] memory sqrtPriceX96AfterList,
            uint32[] memory initializedTicksCrossedList,
            uint256 gasEstimate
        )
    {
        if (amountIn == 0) revert ZeroAmount();
        _validateEndpoints(tokenIn, tokenOut);
        UniswapV3PathValidator.validate(path, tokenIn, tokenOut, MAX_HOPS);

        bytes memory callData = abi.encodeCall(IUniswapV3QuoterV2.quoteExactInput, (path, amountIn));
        (bool ok, bytes memory ret) = QUOTER.call(callData);
        if (!ok) {
            if (ret.length == 0) revert QuoterCallFailed();
            assembly ("memory-safe") {
                revert(add(ret, 0x20), mload(ret))
            }
        }

        (amountOutGross, sqrtPriceX96AfterList, initializedTicksCrossedList, gasEstimate) =
            abi.decode(ret, (uint256, uint160[], uint32[], uint256));

        feeAmount = FeeMath.feeOnGross(amountOutGross, feeBps);
        amountOutNet = amountOutGross - feeAmount;
    }

    /// @notice ERC20 multi-hop → ERC20. Output to `msg.sender` only.
    function swapExactInputERC20(
        bytes calldata path,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinNet,
        uint256 deadline
    )
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 amountOutGross, uint256 feeAmount, uint256 amountOutNet)
    {
        if (msg.value != 0) revert InvalidMsgValue();
        if (amountIn == 0) revert ZeroAmount();
        if (deadline < block.timestamp) revert DeadlineExpired();
        _validateEndpoints(tokenIn, tokenOut);
        UniswapV3PathValidator.validate(path, tokenIn, tokenOut, MAX_HOPS);

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(ROUTER, amountIn);

        uint256 grossMin = FeeMath.grossMinFromNetMin(amountOutMinNet, feeBps);

        IUniswapV3SwapRouter02.ExactInputParams memory params = IUniswapV3SwapRouter02.ExactInputParams({
            path: path, recipient: address(this), amountIn: amountIn, amountOutMinimum: grossMin
        });

        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV3SwapRouter02(ROUTER).exactInput(params);
        amountOutGross = IERC20(tokenOut).balanceOf(address(this)) - balBefore;

        feeAmount = FeeMath.feeOnGross(amountOutGross, feeBps);
        amountOutNet = amountOutGross - feeAmount;
        if (amountOutNet < amountOutMinNet) revert SlippageExceeded();

        IERC20(tokenOut).safeTransfer(treasury, feeAmount);
        IERC20(tokenOut).safeTransfer(msg.sender, amountOutNet);
        IERC20(tokenIn).forceApprove(ROUTER, 0);

        if (IERC20(tokenOut).balanceOf(address(this)) != balBefore) revert UnexpectedTokenOutBalance();

        uint24 feeFirst = UniswapV3PathValidator.firstPoolFee(path);
        emit SwapExecuted(
            tokenIn, tokenOut, feeFirst, msg.sender, amountIn, amountOutGross, feeAmount, amountOutNet, false, false
        );
    }

    function _validateEndpoints(address tokenIn, address tokenOut) internal pure {
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (tokenIn == tokenOut) revert SameToken();
    }
}
