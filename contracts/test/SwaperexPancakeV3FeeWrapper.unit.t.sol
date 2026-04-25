// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {SwaperexPancakeV3FeeWrapper} from "../src/SwaperexPancakeV3FeeWrapper.sol";
import {MockPancakeSwapRouter} from "./mocks/MockPancakeSwapRouter.sol";
import {MockQuoterV2} from "./mocks/MockQuoterV2.sol";
import {MockReentrantRouterPancake} from "./mocks/MockReentrantRouterPancake.sol";

contract SwaperexPancakeV3FeeWrapperUnitTest is Test {
    uint16 internal constant FEE_BPS = 100;

    MockPancakeSwapRouter internal router;
    MockQuoterV2 internal quoter;
    SwaperexPancakeV3FeeWrapper internal w;
    ERC20Mock internal tokenIn;
    ERC20Mock internal tokenOut;
    address internal treasury = address(0xFEE);
    address internal user = address(0xA11CE);

    function setUp() public {
        router = new MockPancakeSwapRouter();
        quoter = new MockQuoterV2();
        tokenIn = new ERC20Mock();
        tokenOut = new ERC20Mock();
        w = new SwaperexPancakeV3FeeWrapper(address(router), address(quoter), treasury, FEE_BPS);
    }

    function test_quote_matches_fee_math() public {
        uint256 g = 1_000_000 * 1e18;
        quoter.setAmountOut(g);
        (uint256 qG, uint256 qFee, uint256 qNet,,,) =
            w.quoteExactInputSingleERC20(address(tokenIn), address(tokenOut), 3000, 1e18, 0);
        assertEq(qG, g);
        assertEq(qFee, FeeMath.feeOnGross(g, FEE_BPS));
        assertEq(qNet, g - qFee);
    }

    /// @dev H-1: pre-existing `tokenOut` on the wrapper must not brick swaps; fee accounting stays delta-based.
    function test_swap_succeeds_with_preexisting_tokenOut_dust_on_wrapper() public {
        uint256 dust = 7;
        tokenOut.mint(address(w), dust);

        uint256 gross = 500_000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);

        uint256 amountIn = 1000 * 1e18;
        tokenIn.mint(user, amountIn);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(address(tokenIn), address(tokenOut), 3000, amountIn, 0);
        uint256 minNet = qNet - 100;

        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) = w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, user, amountIn, minNet, block.timestamp + 1 days, 0
        );
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(user), outNet);
        assertEq(IERC20(tokenOut).balanceOf(treasury), feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(address(w)), dust);
    }

    function test_swap_happy_path_and_treasury_receives_fee() public {
        uint256 gross = 500_000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);

        uint256 amountIn = 1000 * 1e18;
        tokenIn.mint(user, amountIn);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(address(tokenIn), address(tokenOut), 3000, amountIn, 0);

        uint256 minNet = qNet - 100;
        assertTrue(minNet > 0);

        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) = w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, user, amountIn, minNet, block.timestamp + 1 days, 0
        );
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(user), outNet);
        assertEq(IERC20(tokenOut).balanceOf(treasury), feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(address(w)), 0);
    }

    function test_swap_reverts_zeroRecipient() public {
        quoter.setAmountOut(1e18);
        router.setGrossOut(1e18);
        tokenIn.mint(user, 1e18);
        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        vm.expectRevert(SwaperexPancakeV3FeeWrapper.ZeroAddress.selector);
        w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, address(0), 1e18, 1, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }

    function test_swap_reverts_sameToken() public {
        vm.expectRevert(SwaperexPancakeV3FeeWrapper.SameToken.selector);
        w.quoteExactInputSingleERC20(address(tokenIn), address(tokenIn), 3000, 1e18, 0);
    }

    function test_swap_reverts_insufficient_allowance() public {
        quoter.setAmountOut(1e18);
        router.setGrossOut(1e18);
        tokenIn.mint(user, 1e18);
        vm.startPrank(user);
        vm.expectRevert();
        w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, user, 1e18, 1, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }

    function test_swap_reverts_slippage() public {
        uint256 gross = 1000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);

        tokenIn.mint(user, 1e18);
        uint256 minNet = gross;

        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        vm.expectRevert("MockRouter_Slippage");
        w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, user, 1e18, minNet, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }

    function test_reentrancy_nested_swap_reverts() public {
        MockReentrantRouterPancake badRouter = new MockReentrantRouterPancake();
        MockQuoterV2 q = new MockQuoterV2();
        SwaperexPancakeV3FeeWrapper w2 =
            new SwaperexPancakeV3FeeWrapper(address(badRouter), address(q), treasury, FEE_BPS);
        badRouter.setWrapper(w2);

        tokenIn.mint(user, 10e18);
        vm.startPrank(user);
        tokenIn.approve(address(w2), type(uint256).max);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        w2.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, user, 1e18, 1, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }
}
