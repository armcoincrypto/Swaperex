// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FeeMath} from "../src/libraries/FeeMath.sol";
import {UniswapV3PathValidator} from "../src/libraries/UniswapV3PathValidator.sol";
import {SwaperexUniswapV3FeeWrapperV3} from "../src/SwaperexUniswapV3FeeWrapperV3.sol";
import {IUniswapV3QuoterV2} from "../src/interfaces/IUniswapV3QuoterV2.sol";

/// @dev Fork tests run only when `MAINNET_RPC_URL` is set; otherwise each test `vm.skip`s.
/// @dev QuoterV2 must be invoked with `CALL` (not `STATICCALL`) — matches production wrapper behavior.
contract SwaperexUniswapV3FeeWrapperV3ForkTest is Test {
    address internal constant ROUTER = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    address internal constant QUOTER = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    /// @dev Synthetix Network Token (mainnet).
    address internal constant SNX = 0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F;
    /// @dev Pendle (mainnet).
    address internal constant PENDLE = 0x808507121B80c02388fAd14726482e061B8da827;

    uint16 internal constant FEE_BPS = 50;
    address internal treasury = address(0xFEEE);

    SwaperexUniswapV3FeeWrapperV3 internal w;
    address internal user = address(0xCAFE);
    bool internal forkActive;

    /// @dev Default probe sizes for path discovery (not asserted against quote output).
    uint256 internal constant PROBE_WETH = 0.2 ether;
    uint256 internal constant PROBE_USDC = 5_000e6;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            forkActive = false;
            return;
        }
        vm.createSelectFork(rpc);
        w = new SwaperexUniswapV3FeeWrapperV3(address(this), ROUTER, QUOTER, WETH, treasury, FEE_BPS);
        forkActive = true;
    }

    modifier forkOnly() {
        if (!forkActive) vm.skip(true);
        _;
    }

    function _quoteRaw(bytes memory path, uint256 amountIn) internal returns (bool ok, uint256 amountOut) {
        bytes memory cd = abi.encodeCall(IUniswapV3QuoterV2.quoteExactInput, (path, amountIn));
        (bool success, bytes memory ret) = QUOTER.call(cd);
        if (!success || ret.length < 32) return (false, 0);
        (amountOut,,,) = abi.decode(ret, (uint256, uint160[], uint32[], uint256));
        ok = amountOut > 0;
    }

    function _findSingleHop(address tIn, address tOut, uint256 amountIn) internal returns (bytes memory path) {
        uint24[3] memory fees = [uint24(500), 3000, 10_000];
        for (uint256 i = 0; i < fees.length; i++) {
            bytes memory p = abi.encodePacked(tIn, fees[i], tOut);
            (bool ok,) = _quoteRaw(p, amountIn);
            if (ok) return p;
        }
        revert("fork_v3: no single-hop pool for pair");
    }

    function _find2Hop(address t0, address t1, address t2, uint256 amountIn) internal returns (bytes memory path) {
        uint24[3] memory fees = [uint24(500), 3000, 10_000];
        for (uint256 i = 0; i < fees.length; i++) {
            for (uint256 j = 0; j < fees.length; j++) {
                bytes memory p = abi.encodePacked(t0, fees[i], t1, fees[j], t2);
                (bool ok,) = _quoteRaw(p, amountIn);
                if (ok) return p;
            }
        }
        revert("fork_v3: no two-hop pool path");
    }

    function _assertQuoteFee(bytes memory path, address tokenIn, address tokenOut, uint256 amountIn) internal {
        (uint256 g, uint256 fee, uint256 net,,,) = w.quoteExactInputERC20(path, tokenIn, tokenOut, amountIn);
        assertGt(g, 0, "gross");
        assertEq(fee, FeeMath.feeOnGross(g, FEE_BPS), "fee on gross");
        assertEq(net, g - fee, "net");
    }

    function _assertNoTokenOutDust(address tokenOut) internal view {
        assertEq(IERC20(tokenOut).balanceOf(address(w)), 0, "wrapper tokenOut dust");
    }

    /// @dev 1) WETH → USDC (single hop).
    function testFork_wethToUsdc_quoteAndSwap() public forkOnly {
        uint256 amountIn = 0.15 ether;
        bytes memory path = _findSingleHop(WETH, USDC, PROBE_WETH);

        _assertQuoteFee(path, WETH, USDC, amountIn);

        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputERC20(path, WETH, USDC, amountIn);
        uint256 minNet = (qNet * 99) / 100;

        deal(WETH, user, amountIn);
        uint256 treasuryBefore = IERC20(USDC).balanceOf(treasury);
        uint256 userUsdcBefore = IERC20(USDC).balanceOf(user);

        vm.startPrank(user);
        IERC20(WETH).approve(address(w), type(uint256).max);
        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputERC20(path, WETH, USDC, amountIn, minNet, block.timestamp + 3600);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 20e6, "gross quote vs exec (USDC 6dp)");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS), "treasury fee math");
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(USDC).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(USDC).balanceOf(user) - userUsdcBefore, minNet);
        _assertNoTokenOutDust(USDC);
        assertEq(IERC20(WETH).balanceOf(address(w)), 0, "wrapper WETH dust");
    }

    /// @dev 2) WETH → USDC → SNX (two hops).
    function testFork_wethToUsdcToSnx_quoteAndSwap() public forkOnly {
        uint256 amountIn = 0.2 ether;
        bytes memory path = _find2Hop(WETH, USDC, SNX, PROBE_WETH);

        _assertQuoteFee(path, WETH, SNX, amountIn);

        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputERC20(path, WETH, SNX, amountIn);
        uint256 minNet = (qNet * 98) / 100;

        deal(WETH, user, amountIn);
        uint256 treasuryBefore = IERC20(SNX).balanceOf(treasury);
        uint256 userSnxBefore = IERC20(SNX).balanceOf(user);

        vm.startPrank(user);
        IERC20(WETH).approve(address(w), type(uint256).max);
        (uint256 gExec, uint256 feeExec, uint256 netExec) =
            w.swapExactInputERC20(path, WETH, SNX, amountIn, minNet, block.timestamp + 3600);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 5e17, "gross quote vs exec SNX");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(netExec, gExec - feeExec);
        assertEq(IERC20(SNX).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(SNX).balanceOf(user) - userSnxBefore, minNet);
        _assertNoTokenOutDust(SNX);
        assertEq(IERC20(WETH).balanceOf(address(w)), 0);
    }

    /// @dev 3) WETH → USDC → PENDLE if a two-hop path exists on the fork.
    function testFork_wethToUsdcToPendle_quoteAndSwap() public forkOnly {
        uint256 amountIn = 0.15 ether;
        bytes memory path;
        bool found;
        uint24[3] memory fees = [uint24(500), 3000, 10_000];
        for (uint256 i = 0; i < 3 && !found; i++) {
            for (uint256 j = 0; j < 3; j++) {
                bytes memory p = abi.encodePacked(WETH, fees[i], USDC, fees[j], PENDLE);
                (bool ok,) = _quoteRaw(p, PROBE_WETH);
                if (ok) {
                    path = p;
                    found = true;
                    break;
                }
            }
        }
        if (!found) vm.skip(true);

        _assertQuoteFee(path, WETH, PENDLE, amountIn);
        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputERC20(path, WETH, PENDLE, amountIn);
        uint256 minNet = (qNet * 98) / 100;

        deal(WETH, user, amountIn);
        uint256 treasuryBefore = IERC20(PENDLE).balanceOf(treasury);
        uint256 userBefore = IERC20(PENDLE).balanceOf(user);

        vm.startPrank(user);
        IERC20(WETH).approve(address(w), type(uint256).max);
        (uint256 gExec, uint256 feeExec,) = w.swapExactInputERC20(path, WETH, PENDLE, amountIn, minNet, block.timestamp + 3600);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 5e17, "gross quote vs exec PENDLE");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(IERC20(PENDLE).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(PENDLE).balanceOf(user) - userBefore, minNet);
        _assertNoTokenOutDust(PENDLE);
        assertEq(IERC20(WETH).balanceOf(address(w)), 0);
    }

    /// @dev 4) USDC → WETH → SNX (two hops, WETH middle leg).
    function testFork_usdcToWethToSnx_quoteAndSwap() public forkOnly {
        uint256 amountIn = 8_000e6;
        bytes memory path = _find2Hop(USDC, WETH, SNX, PROBE_USDC);

        _assertQuoteFee(path, USDC, SNX, amountIn);

        (uint256 qGross,, uint256 qNet,,,) = w.quoteExactInputERC20(path, USDC, SNX, amountIn);
        uint256 minNet = (qNet * 98) / 100;

        deal(USDC, user, amountIn);
        uint256 treasuryBefore = IERC20(SNX).balanceOf(treasury);
        uint256 userSnxBefore = IERC20(SNX).balanceOf(user);

        vm.startPrank(user);
        IERC20(USDC).approve(address(w), type(uint256).max);
        (uint256 gExec, uint256 feeExec,) = w.swapExactInputERC20(path, USDC, SNX, amountIn, minNet, block.timestamp + 3600);
        vm.stopPrank();

        assertApproxEqAbs(gExec, qGross, 5e17, "gross quote vs exec SNX");
        assertEq(feeExec, FeeMath.feeOnGross(gExec, FEE_BPS));
        assertEq(IERC20(SNX).balanceOf(treasury) - treasuryBefore, feeExec);
        assertGe(IERC20(SNX).balanceOf(user) - userSnxBefore, minNet);
        _assertNoTokenOutDust(SNX);
        assertEq(IERC20(USDC).balanceOf(address(w)), 0);
    }

    /// @dev Bad slippage: impossible min net reverts (router or wrapper).
    function testFork_wethToUsdc_slippage_reverts() public forkOnly {
        uint256 amountIn = 0.1 ether;
        bytes memory path = _findSingleHop(WETH, USDC, PROBE_WETH);
        (,, uint256 qNet,,,) = w.quoteExactInputERC20(path, WETH, USDC, amountIn);
        uint256 impossibleMin = qNet + 1_000_000e6;

        deal(WETH, user, amountIn);
        vm.startPrank(user);
        IERC20(WETH).approve(address(w), type(uint256).max);
        vm.expectRevert();
        w.swapExactInputERC20(path, WETH, USDC, amountIn, impossibleMin, block.timestamp + 3600);
        vm.stopPrank();
    }

    /// @dev Invalid path: `tokenIn` does not match path first segment (avoid `SameToken` on endpoints).
    function testFork_invalidPath_tokenMismatch_reverts() public forkOnly {
        uint256 amountIn = 0.05 ether;
        bytes memory path = _findSingleHop(WETH, USDC, PROBE_WETH);
        vm.expectRevert(UniswapV3PathValidator.Path_TokenMismatch.selector);
        w.quoteExactInputERC20(path, SNX, USDC, amountIn);
    }

    /// @dev Unsupported path: disallowed fee tier in packed path.
    function testFork_invalidPath_badFeeTier_reverts() public forkOnly {
        bytes memory path = abi.encodePacked(WETH, uint24(1234), USDC);
        vm.expectRevert(abi.encodeWithSelector(UniswapV3PathValidator.Path_FeeNotAllowed.selector, uint24(1234)));
        w.quoteExactInputERC20(path, WETH, USDC, 0.01 ether);
    }

    /// @dev Unsupported path: well-formed fees but no pool / zero output — Quoter reverts or returns zero; wrapper surfaces revert.
    function testFork_unsupportedPath_quoterReverts_cleanly() public forkOnly {
        /// @dev Random unused addresses unlikely to have V3 pools together.
        address garbageA = address(uint160(uint256(keccak256("fork_v3_garbage_a"))));
        address garbageB = address(uint160(uint256(keccak256("fork_v3_garbage_b"))));
        bytes memory path = abi.encodePacked(garbageA, uint24(3000), garbageB);
        vm.expectRevert();
        w.quoteExactInputERC20(path, garbageA, garbageB, 1e18);
    }

    /// @dev Sending ETH with ERC20 swap must revert.
    function testFork_swap_rejects_msgValue() public forkOnly {
        uint256 amountIn = 0.05 ether;
        bytes memory path = _findSingleHop(WETH, USDC, PROBE_WETH);
        deal(WETH, user, amountIn);
        vm.startPrank(user);
        IERC20(WETH).approve(address(w), type(uint256).max);
        vm.expectRevert(SwaperexUniswapV3FeeWrapperV3.InvalidMsgValue.selector);
        w.swapExactInputERC20{value: 1 wei}(path, WETH, USDC, amountIn, 1, block.timestamp + 3600);
        vm.stopPrank();
    }
}
