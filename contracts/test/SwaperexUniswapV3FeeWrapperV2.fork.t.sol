// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {SwaperexUniswapV3FeeWrapperV2} from "../src/SwaperexUniswapV3FeeWrapperV2.sol";
import {IUniswapV3QuoterV2} from "../src/interfaces/IUniswapV3QuoterV2.sol";

/// @dev Fork tests run only when `MAINNET_RPC_URL` is set; otherwise each test `vm.skip`s.
contract SwaperexUniswapV3FeeWrapperV2ForkTest is Test {
    address internal constant ROUTER = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address internal constant QUOTER = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;
    address internal constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    /// @dev USDC is used for ERC20→ETH fork execution due to standard ERC20 behavior with `deal()`.
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    uint16 internal constant FEE_BPS = 50;
    address internal treasury = address(0xFEEE);

    SwaperexUniswapV3FeeWrapperV2 internal w;
    address internal user = address(0xCAFE);
    bool internal forkActive;
    uint24 internal poolFeeWethUsdt;
    uint24 internal poolFeeUsdcWeth;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            forkActive = false;
            return;
        }
        vm.createSelectFork(rpc);
        poolFeeWethUsdt = _pickPoolFee(WETH, USDT, 1 ether);
        poolFeeUsdcWeth = _pickPoolFee(USDC, WETH, 1_000e6);
        w = new SwaperexUniswapV3FeeWrapperV2(address(this), ROUTER, QUOTER, WETH, treasury, FEE_BPS);
        forkActive = true;
    }

    /// @dev QuoterV2 must be called (not staticcall) for a valid simulation on forked mainnet.
    function _pickPoolFee(address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint24) {
        uint24[3] memory fees = [uint24(500), 3000, 10000];
        for (uint256 i = 0; i < fees.length; i++) {
            IUniswapV3QuoterV2.QuoteExactInputSingleParams memory p = IUniswapV3QuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn, tokenOut: tokenOut, amountIn: amountIn, fee: fees[i], sqrtPriceLimitX96: 0
            });
            bytes memory cd = abi.encodeWithSelector(IUniswapV3QuoterV2.quoteExactInputSingle.selector, p);
            (bool ok, bytes memory ret) = QUOTER.call(cd);
            if (ok && ret.length >= 32) {
                uint256 amountOut = abi.decode(ret, (uint256));
                if (amountOut > 0) return fees[i];
            }
        }
        revert("fork: no Uniswap v3 pool found for pair");
    }

    modifier forkOnly() {
        if (!forkActive) vm.skip(true);
        _;
    }

    /// @dev A) ETH → USDT: user receives net USDT; treasury receives fee in USDT.
    function testFork_ethToUsdt_userNet_treasuryFee() public forkOnly {
        uint256 amountIn = 0.5 ether;
        vm.deal(user, 20 ether);

        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(WETH, USDT, poolFeeWethUsdt, amountIn, 0);
        uint256 minNet = (qNet * 99) / 100;

        uint256 treasuryBefore = IERC20(USDT).balanceOf(treasury);
        uint256 userUsdtBefore = IERC20(USDT).balanceOf(user);

        vm.prank(user);
        (uint256 gExec, uint256 feeExec, uint256 netExec) = w.swapExactInputSingleEthForTokens{value: amountIn}(
            USDT, poolFeeWethUsdt, amountIn, minNet, block.timestamp + 3600, 0
        );

        assertApproxEqAbs(gExec, qGross, 5, "gross quote vs exec");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(USDT).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(USDT).balanceOf(user) - userUsdtBefore, minNet);
        assertEq(IERC20(WETH).balanceOf(address(w)), 0);
    }

    /// @dev B) ERC20 → ETH: user receives net ETH; treasury receives fee in ETH.
    /// @dev USDT is intentionally avoided here: it is non-standard and funding it with `deal()` can be unstable across forks.
    function testFork_usdcToEth_userEth_treasuryFee() public forkOnly {
        deal(USDC, user, 10_000e6);
        uint256 amountIn = 2_000e6;

        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(USDC, WETH, poolFeeUsdcWeth, amountIn, 0);
        uint256 minNet = (qNet * 99) / 100;

        uint256 userEthBefore = user.balance;
        uint256 treasuryEthBefore = treasury.balance;

        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);
        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputSingleTokensForEth(USDC, poolFeeUsdcWeth, amountIn, minNet, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 5, "gross quote vs exec");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(treasury.balance - treasuryEthBefore, feeExec);
        assertGe(user.balance - userEthBefore, minNet);
        assertEq(IERC20(WETH).balanceOf(address(w)), 0);
    }

    /// @dev C) Small input: must not revert on realistic tiny trade.
    function testFork_ethToUsdt_smallAmount_noRevert() public forkOnly {
        uint256 amountIn = 0.001 ether;
        vm.deal(user, 1 ether);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(WETH, USDT, poolFeeWethUsdt, amountIn, 0);
        uint256 minNet = (qNet * 95) / 100;

        vm.prank(user);
        w.swapExactInputSingleEthForTokens{value: amountIn}(
            USDT, poolFeeWethUsdt, amountIn, minNet, block.timestamp + 3600, 0
        );
    }

    /// @dev D) Slippage: impossible minNet reverts.
    function testFork_ethToUsdt_slippage_reverts() public forkOnly {
        uint256 amountIn = 0.1 ether;
        vm.deal(user, 2 ether);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(WETH, USDT, poolFeeWethUsdt, amountIn, 0);
        uint256 impossibleMin = qNet + 1_000_000e6;

        // On a real Uniswap V3 fork, the router can revert first with its own error (e.g. "Too little received")
        // before the wrapper’s net-out check triggers. We only assert "reverts" here to keep the fork test stable.
        vm.prank(user);
        vm.expectRevert();
        w.swapExactInputSingleEthForTokens{value: amountIn}(
            USDT, poolFeeWethUsdt, amountIn, impossibleMin, block.timestamp + 3600, 0
        );
    }
}
