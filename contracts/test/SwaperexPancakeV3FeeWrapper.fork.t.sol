// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {SwaperexPancakeV3FeeWrapper} from "../src/SwaperexPancakeV3FeeWrapper.sol";

interface IWBNB is IERC20 {
    function deposit() external payable;
}

/// @dev Fork tests run only when `BSC_RPC_URL` is set; otherwise each test `vm.skip`s.
contract SwaperexPancakeV3FeeWrapperForkTest is Test {
    /// @dev Official Pancake V3 SwapRouter (BSC mainnet).
    address internal constant ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;
    /// @dev Official Pancake V3 QuoterV2 (BSC mainnet).
    address internal constant QUOTER = 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997;
    /// @dev BSC USDT (BEP-20, 18 decimals).
    address internal constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    /// @dev 0.01% tier — verified via `cast call` QuoterV2 for WBNB→USDT on BSC.
    uint24 internal constant POOL_FEE = 100;

    uint16 internal constant FEE_BPS = 50;
    address internal treasury = address(0xFEEE);

    SwaperexPancakeV3FeeWrapper internal w;
    address internal user = address(0xCAFE);
    bool internal forkActive;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            forkActive = false;
            return;
        }
        vm.createSelectFork(rpc);
        w = new SwaperexPancakeV3FeeWrapper(ROUTER, QUOTER, treasury, FEE_BPS);
        forkActive = true;
    }

    modifier forkOnly() {
        if (!forkActive) vm.skip(true);
        _;
    }

    function _wrapBnb(address who, uint256 wrapAmount) internal {
        vm.deal(who, wrapAmount + 10 ether);
        vm.startPrank(who);
        IWBNB(WBNB).deposit{value: wrapAmount}();
        vm.stopPrank();
    }

    /// @dev H-1: permissionless `tokenOut` dust on the wrapper must not permanently DoS the route.
    function testFork_swap_succeeds_with_preexisting_tokenOut_dust_on_wrapper() public forkOnly {
        deal(USDT, address(w), 1 wei);

        _wrapBnb(user, 50 ether);
        uint256 amountIn = 2 ether;

        vm.startPrank(user);
        IERC20(WBNB).approve(address(w), type(uint256).max);

        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(WBNB, USDT, POOL_FEE, amountIn, 0);
        uint256 minNet = (qNet * 99) / 100;

        uint256 treasuryBefore = IERC20(USDT).balanceOf(treasury);
        uint256 dustBefore = IERC20(USDT).balanceOf(address(w));

        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputSingleERC20(WBNB, USDT, POOL_FEE, user, amountIn, minNet, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertEq(dustBefore, 1 wei);
        assertApproxEqAbs(gExec, qGross, 5, "gross quote vs exec");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(USDT).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(USDT).balanceOf(user), minNet);
        assertEq(IERC20(USDT).balanceOf(address(w)), dustBefore);
    }

    function testFork_happyPath_wbnbToUsdt_feeToTreasury() public forkOnly {
        _wrapBnb(user, 50 ether);
        uint256 amountIn = 2 ether;

        vm.startPrank(user);
        IERC20(WBNB).approve(address(w), type(uint256).max);

        (uint256 qGross, uint256 qFee, uint256 qNet,,,) =
            w.quoteExactInputSingleERC20(WBNB, USDT, POOL_FEE, amountIn, 0);

        uint256 minNet = (qNet * 99) / 100;

        uint256 treasuryBefore = IERC20(USDT).balanceOf(treasury);

        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputSingleERC20(WBNB, USDT, POOL_FEE, user, amountIn, minNet, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 5, "gross quote vs exec");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(qFee, FeeMath.feeOnGross(qGross, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(USDT).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(USDT).balanceOf(user), minNet);
        assertEq(IERC20(USDT).balanceOf(address(w)), 0);
    }

    function testFork_quoteVsExecute_grossApprox() public forkOnly {
        _wrapBnb(user, 20 ether);
        uint256 amountIn = 1 ether;

        vm.startPrank(user);
        IERC20(WBNB).approve(address(w), type(uint256).max);
        (uint256 qG,,,,,) = w.quoteExactInputSingleERC20(WBNB, USDT, POOL_FEE, amountIn, 0);
        (uint256 g,,) = w.swapExactInputSingleERC20(WBNB, USDT, POOL_FEE, user, amountIn, 1, block.timestamp + 3600, 0);
        vm.stopPrank();

        assertApproxEqAbs(g, qG, 5);
    }

    function testFork_revert_zeroRecipient() public forkOnly {
        _wrapBnb(user, 2 ether);
        vm.startPrank(user);
        IERC20(WBNB).approve(address(w), type(uint256).max);
        vm.expectRevert(SwaperexPancakeV3FeeWrapper.ZeroAddress.selector);
        w.swapExactInputSingleERC20(WBNB, USDT, POOL_FEE, address(0), 0.5 ether, 1, block.timestamp + 3600, 0);
        vm.stopPrank();
    }

    function testFork_revert_sameToken() public forkOnly {
        vm.expectRevert(SwaperexPancakeV3FeeWrapper.SameToken.selector);
        w.quoteExactInputSingleERC20(USDT, USDT, POOL_FEE, 1_000e18, 0);
    }

    function testFork_revert_insufficientAllowance() public forkOnly {
        _wrapBnb(user, 2 ether);
        vm.startPrank(user);
        vm.expectRevert();
        w.swapExactInputSingleERC20(WBNB, USDT, POOL_FEE, user, 0.5 ether, 1, block.timestamp + 3600, 0);
        vm.stopPrank();
    }

    function testFork_revert_slippage_minNetTooHigh() public forkOnly {
        _wrapBnb(user, 5 ether);
        vm.startPrank(user);
        IERC20(WBNB).approve(address(w), type(uint256).max);

        (,, uint256 qNet,,,) = w.quoteExactInputSingleERC20(WBNB, USDT, POOL_FEE, 0.5 ether, 0);
        uint256 impossibleMin = qNet + 1_000_000 ether;

        vm.expectRevert();
        w.swapExactInputSingleERC20(WBNB, USDT, POOL_FEE, user, 0.5 ether, impossibleMin, block.timestamp + 3600, 0);
        vm.stopPrank();
    }

    function testFork_feeMath_boundary_on_quote() public forkOnly {
        (uint256 g,, uint256 n,,,) = w.quoteExactInputSingleERC20(WBNB, USDT, POOL_FEE, 0.1 ether, 0);
        assertEq(n, g - FeeMath.feeOnGross(g, FEE_BPS));
    }
}
