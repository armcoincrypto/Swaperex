// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {SwaperexUniswapV3FeeWrapper} from "../src/SwaperexUniswapV3FeeWrapper.sol";

/// @dev Fork tests run only when `MAINNET_RPC_URL` is set; otherwise each test `vm.skip`s.
contract SwaperexUniswapV3FeeWrapperForkTest is Test {
    address internal constant ROUTER = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address internal constant QUOTER = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    uint24 internal constant POOL_FEE = 500;

    uint16 internal constant FEE_BPS = 50;
    address internal treasury = address(0xFEEE);

    SwaperexUniswapV3FeeWrapper internal w;
    address internal user = address(0xCAFE);
    bool internal forkActive;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            forkActive = false;
            return;
        }
        vm.createSelectFork(rpc);
        w = new SwaperexUniswapV3FeeWrapper(ROUTER, QUOTER, treasury, FEE_BPS);
        forkActive = true;
    }

    modifier forkOnly() {
        if (!forkActive) vm.skip(true);
        _;
    }

    /// @dev H-1: permissionless WETH dust on the wrapper must not permanently DoS the route.
    function testFork_swap_succeeds_with_preexisting_tokenOut_dust_on_wrapper() public forkOnly {
        deal(WETH, address(w), 1 wei);

        deal(USDC, user, 25_000e6);
        uint256 amountIn = 5_000e6;

        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);

        (uint256 qGross,, uint256 qNet,,,) =
            w.quoteExactInputSingleERC20(USDC, WETH, POOL_FEE, amountIn, 0);
        uint256 minNet = (qNet * 99) / 100;

        uint256 treasuryBefore = IERC20(WETH).balanceOf(treasury);
        uint256 dustBefore = IERC20(WETH).balanceOf(address(w));

        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputSingleERC20(USDC, WETH, POOL_FEE, user, amountIn, minNet, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertEq(dustBefore, 1 wei);
        assertApproxEqAbs(gExec, qGross, 5, "gross quote vs exec");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(WETH).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(WETH).balanceOf(user), minNet);
        assertEq(IERC20(WETH).balanceOf(address(w)), dustBefore);
    }

    function testFork_happyPath_usdcToWeth_feeToTreasury() public forkOnly {
        deal(USDC, user, 25_000e6);
        uint256 amountIn = 5_000e6;

        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);

        (uint256 qGross, uint256 qFee, uint256 qNet,,,) =
            w.quoteExactInputSingleERC20(USDC, WETH, POOL_FEE, amountIn, 0);

        uint256 minNet = (qNet * 99) / 100;

        uint256 treasuryBefore = IERC20(WETH).balanceOf(treasury);

        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputSingleERC20(USDC, WETH, POOL_FEE, user, amountIn, minNet, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 5, "gross quote vs exec");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(qFee, FeeMath.feeOnGross(qGross, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(WETH).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(WETH).balanceOf(user), minNet);
        assertEq(IERC20(WETH).balanceOf(address(w)), 0);
    }

    function testFork_quoteVsExecute_grossApprox() public forkOnly {
        deal(USDC, user, 15_000e6);
        uint256 amountIn = 2_000e6;

        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);
        (uint256 qG,,,,,) = w.quoteExactInputSingleERC20(USDC, WETH, POOL_FEE, amountIn, 0);
        (uint256 g,,) = w.swapExactInputSingleERC20(USDC, WETH, POOL_FEE, user, amountIn, 1, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertApproxEqAbs(g, qG, 5);
    }

    function testFork_revert_zeroRecipient() public forkOnly {
        deal(USDC, user, 5_000e6);
        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);
        vm.expectRevert(SwaperexUniswapV3FeeWrapper.ZeroAddress.selector);
        w.swapExactInputSingleERC20(USDC, WETH, POOL_FEE, address(0), 1_000e6, 1, block.timestamp + 3600, 0);
        vm.stopPrank();
    }

    function testFork_revert_sameToken() public forkOnly {
        vm.expectRevert(SwaperexUniswapV3FeeWrapper.SameToken.selector);
        w.quoteExactInputSingleERC20(USDC, USDC, POOL_FEE, 1_000e6, 0);
    }

    function testFork_revert_insufficientAllowance() public forkOnly {
        deal(USDC, user, 5_000e6);
        vm.startPrank(user);
        vm.expectRevert();
        w.swapExactInputSingleERC20(USDC, WETH, POOL_FEE, user, 1_000e6, 1, block.timestamp + 3600, 0);
        vm.stopPrank();
    }

    function testFork_revert_slippage_minNetTooHigh() public forkOnly {
        deal(USDC, user, 10_000e6);
        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(USDC, WETH, POOL_FEE, 1_000e6, 0);
        uint256 impossibleMin = qNet + 1_000 ether;

        vm.expectRevert();
        w.swapExactInputSingleERC20(USDC, WETH, POOL_FEE, user, 1_000e6, impossibleMin, block.timestamp + 3600, 0);
        vm.stopPrank();
    }

    function testFork_feeMath_boundary_on_quote() public forkOnly {
        (uint256 g,, uint256 n,,,) = w.quoteExactInputSingleERC20(USDC, WETH, POOL_FEE, 100e6, 0);
        assertEq(n, g - FeeMath.feeOnGross(g, FEE_BPS));
    }
}
