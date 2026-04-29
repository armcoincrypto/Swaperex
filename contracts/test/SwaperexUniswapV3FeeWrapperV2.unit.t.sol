// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {SwaperexUniswapV3FeeWrapperV2} from "../src/SwaperexUniswapV3FeeWrapperV2.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";
import {MockQuoterV2} from "./mocks/MockQuoterV2.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockReentrantRouterV2} from "./mocks/MockReentrantRouterV2.sol";

contract TreasuryStub {
    receive() external payable {}
}

contract SwaperexUniswapV3FeeWrapperV2UnitTest is Test {
    receive() external payable {}
    uint16 internal constant FEE_BPS = 100;

    MockSwapRouter internal router;
    MockQuoterV2 internal quoter;
    MockWETH internal weth;
    SwaperexUniswapV3FeeWrapperV2 internal w;
    ERC20Mock internal tokenIn;
    ERC20Mock internal tokenOut;
    TreasuryStub internal treasury;
    address internal owner = address(this);
    address internal user = address(0xA11CE);

    function setUp() public {
        router = new MockSwapRouter();
        quoter = new MockQuoterV2();
        weth = new MockWETH();
        tokenIn = new ERC20Mock();
        tokenOut = new ERC20Mock();
        treasury = new TreasuryStub();
        w = new SwaperexUniswapV3FeeWrapperV2(owner, address(router), address(quoter), address(weth), address(treasury), FEE_BPS);
    }

    function test_erc20_to_erc20_fee_in_tokenOut() public {
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
        assertEq(IERC20(tokenOut).balanceOf(address(treasury)), feeAmt);
    }

    function test_eth_to_erc20_fee_in_tokenOut() public {
        uint256 gross = 400_000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        uint256 amountIn = 2 ether;

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(address(weth), address(tokenOut), 3000, amountIn, 0);
        uint256 minNet = qNet - 100;

        vm.deal(user, 10 ether);
        vm.startPrank(user);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) =
            w.swapExactInputSingleEthForTokens{value: amountIn}(address(tokenOut), 3000, amountIn, minNet, block.timestamp + 1 days, 0);
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(IERC20(tokenOut).balanceOf(user), outNet);
        assertEq(IERC20(tokenOut).balanceOf(address(treasury)), feeAmt);
        assertEq(IERC20(weth).balanceOf(address(w)), 0);
    }

    function test_erc20_to_eth_fee_in_eth() public {
        uint256 gross = 3 ether;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        // Mock router mints WETH without ETH backing; fund WETH so withdraw can pay the wrapper.
        vm.deal(address(weth), gross + 10 ether);
        uint256 amountIn = 1000 * 1e18;
        tokenIn.mint(user, amountIn);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(address(tokenIn), address(weth), 3000, amountIn, 0);
        uint256 minNet = qNet - 0.01 ether;

        uint256 userEthBefore = user.balance;
        uint256 treasuryEthBefore = address(treasury).balance;

        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) =
            w.swapExactInputSingleTokensForEth(address(tokenIn), 3000, amountIn, minNet, block.timestamp + 1 days, 0);
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(user.balance, userEthBefore + outNet);
        assertEq(address(treasury).balance, treasuryEthBefore + feeAmt);
        assertEq(IERC20(weth).balanceOf(address(w)), 0);
    }

    function test_msg_value_mismatch_reverts() public {
        vm.deal(user, 2 ether);
        vm.startPrank(user);
        vm.expectRevert(SwaperexUniswapV3FeeWrapperV2.InvalidMsgValue.selector);
        w.swapExactInputSingleEthForTokens{value: 1 ether}(address(tokenOut), 3000, 2 ether, 1, block.timestamp + 1 days, 0);
        vm.stopPrank();
    }

    function test_native_input_path_no_transferFrom_on_eth() public {
        uint256 gross = 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        vm.deal(user, 5 ether);
        vm.startPrank(user);
        // No token approval — ETH path must not pull ERC20 from user.
        w.swapExactInputSingleEthForTokens{value: 1 ether}(address(tokenOut), 3000, 1 ether, 1, block.timestamp + 1 days, 0);
        vm.stopPrank();
    }

    function test_pause_blocks_swaps() public {
        w.pause();
        tokenIn.mint(user, 1e18);
        vm.startPrank(user);
        tokenIn.approve(address(w), type(uint256).max);
        vm.expectRevert();
        w.swapExactInputSingleERC20(
            address(tokenIn), address(tokenOut), 3000, 1e18, 1, block.timestamp + 1 days, 0
        );
        vm.stopPrank();
    }

    function test_setTreasury_only_owner() public {
        address newT = address(0xBEEF);
        vm.prank(user);
        vm.expectRevert();
        w.setTreasury(newT);

        w.setTreasury(newT);
        assertEq(w.treasury(), newT);
    }

    function test_setFeeBps_only_owner() public {
        vm.prank(user);
        vm.expectRevert();
        w.setFeeBps(200);

        w.setFeeBps(200);
        assertEq(uint256(w.feeBps()), 200);
    }

    function test_rescue_token_works() public {
        tokenOut.mint(address(w), 123);
        w.pause();
        w.rescueToken(address(tokenOut), owner, 123);
        assertEq(IERC20(tokenOut).balanceOf(owner), 123);
    }

    function test_rescue_eth_works() public {
        vm.deal(address(w), 1 ether);
        w.pause();
        uint256 beforeB = owner.balance;
        w.rescueETH(payable(owner), 1 ether);
        assertEq(owner.balance, beforeB + 1 ether);
    }

    function test_no_leftover_weth_after_native_paths() public {
        uint256 gross = 2 ether;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        vm.deal(user, 10 ether);
        vm.startPrank(user);
        w.swapExactInputSingleEthForTokens{value: 1 ether}(address(tokenOut), 3000, 1 ether, 1, block.timestamp + 1 days, 0);
        vm.stopPrank();
        assertEq(IERC20(weth).balanceOf(address(w)), 0);
    }

    function test_reentrancy_protection() public {
        MockReentrantRouterV2 badRouter = new MockReentrantRouterV2();
        MockQuoterV2 q = new MockQuoterV2();
        SwaperexUniswapV3FeeWrapperV2 w2 =
            new SwaperexUniswapV3FeeWrapperV2(owner, address(badRouter), address(q), address(weth), address(treasury), FEE_BPS);
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

    function test_quote_matches_fee_math() public {
        uint256 g = 1_000_000 * 1e18;
        quoter.setAmountOut(g);
        (uint256 qG, uint256 qFee, uint256 qNet,,,) =
            w.quoteExactInputSingleERC20(address(tokenIn), address(tokenOut), 3000, 1e18, 0);
        assertEq(qG, g);
        assertEq(qFee, FeeMath.feeOnGross(g, FEE_BPS));
        assertEq(qNet, g - qFee);
    }

    function test_slippage_revert_erc20_router() public {
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

    function test_zero_amount_reverts_quote() public {
        vm.expectRevert(SwaperexUniswapV3FeeWrapperV2.ZeroAmount.selector);
        w.quoteExactInputSingleERC20(address(tokenIn), address(tokenOut), 3000, 0, 0);
    }

    /// @dev Plain ETH to wrapper (not from WETH unwrap) emits observability event only.
    function test_unexpected_eth_received_emits_event() public {
        address donor = address(0xD00000000000000000000000000000000000D0);
        vm.deal(donor, 1 ether);
        vm.expectEmit(true, false, false, true);
        emit SwaperexUniswapV3FeeWrapperV2.UnexpectedETHReceived(donor, 123 wei);
        vm.prank(donor);
        (bool ok,) = payable(address(w)).call{value: 123 wei}("");
        assertTrue(ok);
    }
}
