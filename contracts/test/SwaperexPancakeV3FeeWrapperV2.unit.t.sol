// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {SwaperexPancakeV3FeeWrapperV2} from "../src/SwaperexPancakeV3FeeWrapperV2.sol";
import {MockPancakeSwapRouterV2} from "./mocks/MockPancakeSwapRouterV2.sol";
import {MockQuoterV2} from "./mocks/MockQuoterV2.sol";
import {MockWBNB} from "./mocks/MockWBNB.sol";
import {MockReentrantRouterPancakeV2} from "./mocks/MockReentrantRouterPancakeV2.sol";

contract SwaperexPancakeV3FeeWrapperV2UnitTest is Test {
    uint16 internal constant FEE_BPS = 100;

    address internal owner = address(this);
    address internal treasury = address(0xFEE);
    address internal user = address(0xA11CE);
    address internal outsider = address(0xBAD);

    MockPancakeSwapRouterV2 internal router;
    MockQuoterV2 internal quoter;
    MockWBNB internal wbnb;
    ERC20Mock internal tokenIn;
    ERC20Mock internal tokenOut;
    SwaperexPancakeV3FeeWrapperV2 internal w;

    function setUp() public {
        wbnb = new MockWBNB();
        // `MockWBNB.withdraw` sends native BNB from the WBNB contract balance (mirrors mainnet liability backing).
        vm.deal(address(wbnb), 1_000_000 ether);
        router = new MockPancakeSwapRouterV2(address(wbnb));
        quoter = new MockQuoterV2();
        tokenIn = new ERC20Mock();
        tokenOut = new ERC20Mock();
        w = new SwaperexPancakeV3FeeWrapperV2(owner, address(router), address(quoter), address(wbnb), treasury, FEE_BPS);
    }

    function test_erc20_to_erc20_treasury_receives_fee_user_net() public {
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
            address(tokenIn), address(tokenOut), 3000, amountIn, minNet, block.timestamp + 1 days, 0
        );
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(user), outNet);
        assertEq(IERC20(tokenOut).balanceOf(treasury), feeAmt);
    }

    function test_bnb_to_erc20_fee_in_token() public {
        uint256 gross = 200_000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);

        uint256 amountIn = 2 ether;
        vm.deal(user, 10 ether);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(address(wbnb), address(tokenOut), 3000, amountIn, 0);
        uint256 minNet = qNet - 1;

        vm.startPrank(user);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) = w.swapExactInputSingleEthForTokens{value: amountIn}(
            address(tokenOut), 3000, amountIn, minNet, block.timestamp + 1 days, 0
        );
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(user), outNet);
        assertEq(IERC20(tokenOut).balanceOf(treasury), feeAmt);
    }

    function test_erc20_to_bnb_fee_in_native() public {
        uint256 gross = 3 ether;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);

        uint256 amountIn = 1000 * 1e18;
        tokenIn.mint(user, amountIn);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(address(tokenIn), address(wbnb), 3000, amountIn, 0);
        uint256 minNet = qNet - 100;

        uint256 userEthBefore = user.balance;
        uint256 treasuryEthBefore = treasury.balance;

        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) = w.swapExactInputSingleTokensForEth(
            address(tokenIn), 3000, amountIn, minNet, block.timestamp + 1 days, 0
        );
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(user.balance, userEthBefore + outNet);
        assertEq(treasury.balance, treasuryEthBefore + feeAmt);
    }

    function test_slippage_reverts() public {
        uint256 gross = 1000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        tokenIn.mint(user, 1e18);
        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        vm.expectRevert("MockRouter_Slippage");
        w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, 1e18, gross, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }

    function test_deadline_reverts() public {
        quoter.setAmountOut(1e18);
        router.setGrossOut(1e18);
        tokenIn.mint(user, 1e18);
        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        vm.expectRevert(SwaperexPancakeV3FeeWrapperV2.ExpiredDeadline.selector);
        w.swapExactInputSingleERC20(address(tokenIn), address(tokenOut), 3000, 1e18, 1, block.timestamp - 1, 0);
        vm.stopPrank();
    }

    function test_paused_reverts() public {
        w.pause();
        quoter.setAmountOut(1e18);
        router.setGrossOut(1e18);
        tokenIn.mint(user, 1e18);
        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        vm.expectRevert();
        w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, 1e18, 1, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }

    function test_non_owner_admin_reverts() public {
        vm.prank(outsider);
        vm.expectRevert();
        w.pause();

        vm.prank(outsider);
        vm.expectRevert();
        w.setTreasury(address(0xBEEF));

        vm.prank(outsider);
        vm.expectRevert();
        w.setFeeBps(50);
    }

    function test_fee_cap_reverts() public {
        vm.expectRevert(SwaperexPancakeV3FeeWrapperV2.FeeBps_Invalid.selector);
        w.setFeeBps(1001);
    }

    function test_reentrancy_reverts() public {
        MockReentrantRouterPancakeV2 badRouter = new MockReentrantRouterPancakeV2();
        MockQuoterV2 q = new MockQuoterV2();
        SwaperexPancakeV3FeeWrapperV2 w2 =
            new SwaperexPancakeV3FeeWrapperV2(owner, address(badRouter), address(q), address(wbnb), treasury, FEE_BPS);
        badRouter.setWrapper(w2);

        tokenIn.mint(user, 10e18);
        vm.startPrank(user);
        tokenIn.approve(address(w2), type(uint256).max);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        w2.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, 1e18, 1, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }
}
