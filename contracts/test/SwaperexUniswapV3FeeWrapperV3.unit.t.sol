// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {UniswapV3PathValidator} from "../src/libraries/UniswapV3PathValidator.sol";
import {SwaperexUniswapV3FeeWrapperV3} from "../src/SwaperexUniswapV3FeeWrapperV3.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";
import {MockQuoterV2} from "./mocks/MockQuoterV2.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockReentrantRouterV3} from "./mocks/MockReentrantRouterV3.sol";

contract TreasuryStub {
    receive() external payable {}
}

contract SwaperexUniswapV3FeeWrapperV3UnitTest is Test {
    receive() external payable {}

    uint16 internal constant FEE_BPS = 100;

    MockSwapRouter internal router;
    MockQuoterV2 internal quoter;
    MockWETH internal weth;
    SwaperexUniswapV3FeeWrapperV3 internal w;
    ERC20Mock internal tokenA;
    ERC20Mock internal tokenB;
    ERC20Mock internal tokenC;
    TreasuryStub internal treasury;
    address internal owner = address(this);
    address internal user = address(0xA11CE);

    function setUp() public {
        router = new MockSwapRouter();
        quoter = new MockQuoterV2();
        weth = new MockWETH();
        tokenA = new ERC20Mock();
        tokenB = new ERC20Mock();
        tokenC = new ERC20Mock();
        treasury = new TreasuryStub();
        w = new SwaperexUniswapV3FeeWrapperV3(
            owner, address(router), address(quoter), address(weth), address(treasury), FEE_BPS
        );
    }

    function _path1(address a, uint24 feeAB, address b) internal pure returns (bytes memory) {
        return abi.encodePacked(a, feeAB, b);
    }

    function _path2(address a, uint24 feeAB, address b, uint24 feeBC, address c) internal pure returns (bytes memory) {
        return abi.encodePacked(a, feeAB, b, feeBC, c);
    }

    function _path3(address a, uint24 f1, address b, uint24 f2, address c, uint24 f3, address d)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(a, f1, b, f2, c, f3, d);
    }

    function test_path_numHops_one() public view {
        address a = address(uint160(0xA01));
        address b = address(uint160(0xB02));
        bytes memory p = abi.encodePacked(a, uint24(3000), b);
        assertEq(this._extNumHops(p), 1);
    }

    function test_path_numHops_two() public view {
        address a = address(uint160(0xA01));
        address b = address(uint160(0xB02));
        address c = address(uint160(0xC03));
        bytes memory p = abi.encodePacked(a, uint24(3000), b, uint24(500), c);
        assertEq(this._extNumHops(p), 2);
    }

    function _extNumHops(bytes calldata path) external pure returns (uint256) {
        return UniswapV3PathValidator.numHops(path);
    }

    function test_validate_bad_fee_reverts() public {
        address a = address(tokenA);
        address b = address(tokenB);
        bytes memory p = abi.encodePacked(a, uint24(1234), b);
        vm.expectRevert(abi.encodeWithSelector(UniswapV3PathValidator.Path_FeeNotAllowed.selector, uint24(1234)));
        this._externalValidate(p, a, b, 2);
    }

    function _externalValidate(bytes calldata path, address tokenIn, address tokenOut, uint256 maxHops) external pure {
        UniswapV3PathValidator.validate(path, tokenIn, tokenOut, maxHops);
    }

    function test_validate_token_mismatch_first_reverts() public {
        address a = address(tokenA);
        address b = address(tokenB);
        bytes memory p = abi.encodePacked(a, uint24(3000), b);
        vm.expectRevert(UniswapV3PathValidator.Path_TokenMismatch.selector);
        this._externalValidate(p, address(tokenC), b, 2);
    }

    function test_validate_token_mismatch_last_reverts() public {
        address a = address(tokenA);
        address b = address(tokenB);
        bytes memory p = abi.encodePacked(a, uint24(3000), b);
        vm.expectRevert(UniswapV3PathValidator.Path_TokenMismatch.selector);
        this._externalValidate(p, a, address(tokenC), 2);
    }

    function test_validate_max_hops_exceeded_reverts() public {
        address a = address(tokenA);
        address b = address(tokenB);
        address c = address(tokenC);
        address d = address(0xD4);
        bytes memory p = _path3(a, 3000, b, 500, c, 10_000, d);
        vm.expectRevert(
            abi.encodeWithSelector(UniswapV3PathValidator.Path_MaxHopsExceeded.selector, uint256(3), uint256(2))
        );
        this._externalValidate(p, a, d, 2);
    }

    function test_validate_cycle_ABA_reverts() public {
        address a = address(tokenA);
        address b = address(tokenB);
        bytes memory p = abi.encodePacked(a, uint24(3000), b, uint24(500), a);
        vm.expectRevert(UniswapV3PathValidator.Path_TokenRepeated.selector);
        this._externalValidate(p, a, a, 2);
    }

    function test_validate_zero_first_token_reverts() public {
        address b = address(tokenB);
        bytes memory p = abi.encodePacked(address(0), uint24(3000), b);
        vm.expectRevert(UniswapV3PathValidator.Path_ZeroAddress.selector);
        this._externalValidate(p, address(0), b, 2);
    }

    function test_quote_fee_math_two_hop() public {
        uint256 gross = 800_000 * 1e18;
        quoter.setAmountOut(gross);
        bytes memory path = _path2(address(tokenA), 3000, address(tokenB), 500, address(tokenC));
        (uint256 qG, uint256 qFee, uint256 qNet,,,) =
            w.quoteExactInputERC20(path, address(tokenA), address(tokenC), 1e18);
        assertEq(qG, gross);
        assertEq(qFee, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(qNet, gross - qFee);
    }

    function test_swap_two_hop_treasury_and_user_balances() public {
        uint256 gross = 500_000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        uint256 amountIn = 1000 * 1e18;
        tokenA.mint(user, amountIn);
        bytes memory path = _path2(address(tokenA), 3000, address(tokenB), 500, address(tokenC));

        (,, uint256 qNet,,,) = w.quoteExactInputERC20(path, address(tokenA), address(tokenC), amountIn);
        uint256 minNet = qNet - 100;

        vm.startPrank(user);
        tokenA.approve(address(w), type(uint256).max);
        (uint256 outGross, uint256 feeAmt, uint256 outNet) =
            w.swapExactInputERC20(path, address(tokenA), address(tokenC), amountIn, minNet, block.timestamp + 1 days);
        vm.stopPrank();

        assertEq(outGross, gross);
        assertEq(feeAmt, FeeMath.feeOnGross(gross, FEE_BPS));
        assertEq(outNet, gross - feeAmt);
        assertEq(IERC20(tokenC).balanceOf(user), outNet);
        assertEq(IERC20(tokenC).balanceOf(address(treasury)), feeAmt);
    }

    function test_swap_one_hop_success() public {
        uint256 gross = 100_000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        uint256 amountIn = 50 * 1e18;
        tokenA.mint(user, amountIn);
        bytes memory path = _path1(address(tokenA), 10_000, address(tokenB));

        (,, uint256 qNet,,,) = w.quoteExactInputERC20(path, address(tokenA), address(tokenB), amountIn);
        vm.startPrank(user);
        tokenA.approve(address(w), type(uint256).max);
        w.swapExactInputERC20(path, address(tokenA), address(tokenB), amountIn, qNet - 1, block.timestamp + 1 days);
        vm.stopPrank();

        assertEq(IERC20(tokenB).balanceOf(user), FeeMath.netFromGross(gross, FEE_BPS));
    }

    function test_pause_blocks_swap() public {
        w.pause();
        bytes memory path = _path1(address(tokenA), 3000, address(tokenB));
        tokenA.mint(user, 1e18);
        vm.startPrank(user);
        tokenA.approve(address(w), type(uint256).max);
        vm.expectRevert();
        w.swapExactInputERC20(path, address(tokenA), address(tokenB), 1e18, 1, block.timestamp + 1 days);
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

    function test_reentrancy_blocked() public {
        MockReentrantRouterV3 badRouter = new MockReentrantRouterV3();
        MockQuoterV2 q = new MockQuoterV2();
        SwaperexUniswapV3FeeWrapperV3 w2 = new SwaperexUniswapV3FeeWrapperV3(
            owner, address(badRouter), address(q), address(weth), address(treasury), FEE_BPS
        );
        badRouter.setWrapper(w2);

        tokenA.mint(user, 10e18);
        bytes memory path = _path1(address(tokenA), 3000, address(tokenB));
        vm.startPrank(user);
        tokenA.approve(address(w2), type(uint256).max);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        w2.swapExactInputERC20(path, address(tokenA), address(tokenB), 1e18, 1, block.timestamp + 1 days);
        vm.stopPrank();
    }

    function test_slippage_revert() public {
        uint256 gross = 1000 * 1e18;
        quoter.setAmountOut(gross);
        router.setGrossOut(gross);
        tokenA.mint(user, 1e18);
        bytes memory path = _path1(address(tokenA), 3000, address(tokenB));
        vm.startPrank(user);
        tokenA.approve(address(w), type(uint256).max);
        vm.expectRevert("MockRouter_Slippage");
        w.swapExactInputERC20(path, address(tokenA), address(tokenB), 1e18, gross, block.timestamp + 1 days);
        vm.stopPrank();
    }

    function test_weth_as_endpoint_quote_succeeds() public {
        quoter.setAmountOut(1e18);
        bytes memory path = _path1(address(weth), 3000, address(tokenB));
        (uint256 g, uint256 fee, uint256 net,,,) = w.quoteExactInputERC20(path, address(weth), address(tokenB), 1e18);
        assertEq(g, 1e18);
        assertEq(fee, FeeMath.feeOnGross(g, FEE_BPS));
        assertEq(net, g - fee);
    }

    function test_zero_amount_quote_reverts() public {
        bytes memory path = _path1(address(tokenA), 3000, address(tokenB));
        vm.expectRevert(SwaperexUniswapV3FeeWrapperV3.ZeroAmount.selector);
        w.quoteExactInputERC20(path, address(tokenA), address(tokenB), 0);
    }

    function test_unexpected_eth_received_emits() public {
        address donor = address(0xD00000000000000000000000000000000000D0);
        vm.deal(donor, 1 ether);
        vm.expectEmit(true, false, false, true);
        emit SwaperexUniswapV3FeeWrapperV3.UnexpectedETHReceived(donor, 123 wei);
        vm.prank(donor);
        (bool ok,) = payable(address(w)).call{value: 123 wei}("");
        assertTrue(ok);
    }
}
