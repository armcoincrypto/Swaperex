# Integration Test Plan

## Overview

This document outlines manual and automated testing procedures to verify that all frontend flows work correctly with the non-custodial backend.

---

## 1. Wallet Connection Tests

### 1.1 Connect Flow
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Connect with MetaMask | Click "Connect Wallet" → Approve in wallet | Address shown, status green |
| Reject connection | Click "Connect Wallet" → Reject in wallet | "Connection cancelled" toast, retry button |
| No wallet installed | Load page without MetaMask | "Install MetaMask" button shown |
| Auto-reconnect | Refresh page while connected | Wallet auto-reconnects |

### 1.2 Chain Management
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Connect on supported chain | Connect on Ethereum/BSC/Polygon | Green status indicator |
| Connect on unsupported chain | Connect on unsupported chain | Yellow warning, "Switch Network" button |
| Switch network | Click "Switch Network" → Approve | Chain switches, indicator updates |
| Reject network switch | Click "Switch Network" → Reject | Warning toast, retry available |

### 1.3 Read-Only Mode
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Enter valid address | Type valid 0x address → Click "View" | "View Only" badge, balances shown |
| Enter invalid address | Type invalid address → Click "View" | "Invalid address format" error |
| Exit read-only mode | Click "Exit View Mode" | Return to disconnected state |
| Attempt action in read-only | Try to swap in read-only mode | "Connect wallet to sign" message |

### 1.4 Disconnect Flow
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Disconnect wallet | Click address → "Disconnect" | Return to disconnected state |
| Account switch in MetaMask | Switch account in MetaMask | New address shown, balances refresh |
| MetaMask locked | Lock MetaMask | Wallet disconnects |

---

## 2. Swap Flow Tests

### 2.1 Quote Fetching
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Get swap quote | Select tokens, enter amount | Quote displays with rate and fees |
| Quote for unsupported pair | Select unsupported token pair | "No route found" error |
| Amount too small | Enter very small amount | "Amount too small" error |
| Quote refresh | Wait for quote to expire → Refresh | New quote fetched |

### 2.2 Preview Modal
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Open preview | Click "Preview Swap" | Modal opens with full details |
| Quote expiry timer | Watch timer countdown | Timer shows, turns yellow/red near expiry |
| Quote expires | Let quote expire | "Quote Expired" shown, Confirm disabled |
| Refresh expired quote | Click "Refresh" after expiry | New quote fetched, timer resets |
| High price impact | Swap with >3% impact | Yellow warning shown |
| Very high impact | Swap with >10% impact | Red warning banner |
| Cancel preview | Click "Cancel" | Modal closes, form intact |

### 2.3 Approval Flow
| Test | Steps | Expected Result |
|------|-------|-----------------|
| ERC-20 approval needed | Swap token needing approval | "Step 1/2: Approve" shown |
| Approve in wallet | Confirm approval in wallet | Progress to "Step 2/2: Swap" |
| Reject approval | Reject in wallet | "Approval cancelled" warning, retry available |

### 2.4 Swap Execution
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Confirm swap | Click "Confirm Swap" → Sign | Success screen with tx hash |
| Reject swap | Reject in wallet | "Transaction cancelled" warning |
| Transaction fails | Swap reverts on-chain | Error shown with reason |
| View on explorer | Click explorer link | Opens block explorer in new tab |
| Balance refresh | Complete swap | Balances auto-refresh |

---

## 3. Withdrawal Flow Tests

### 3.1 Form Validation
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Valid inputs | Enter valid amount and address | "Preview Withdrawal" enabled |
| Amount > balance | Enter amount exceeding balance | "Insufficient balance" error |
| Invalid address | Enter malformed address | "Invalid address format" error |
| Same address | Enter own address | "Cannot send to own address" error |
| Empty fields | Leave fields empty | Button disabled |

### 3.2 Template Fetching
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Fetch template | Click "Preview Withdrawal" | Modal opens with tx details |
| Template error | Backend returns error | Error toast, retry available |
| Network fee display | View preview modal | Fee shown in native + USD |

### 3.3 Preview Modal
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Destination display | View preview modal | Full address with copy button |
| Copy address | Click copy button | Address copied to clipboard |
| Transaction details | View preview modal | Network, type, contract shown |
| Cancel preview | Click "Cancel" | Modal closes, form intact |

### 3.4 Withdrawal Execution
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Native token transfer | Withdraw ETH/BNB/MATIC | Single sign, success |
| Token transfer | Withdraw ERC-20 | May require approval, success |
| Reject withdrawal | Reject in wallet | "Transaction cancelled" warning |
| View on explorer | Click explorer link | Opens block explorer |
| Balance refresh | Complete withdrawal | Balances auto-refresh |

---

## 4. Toast & Error Tests

### 4.1 Toast Display
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Success toast | Complete any action | Green toast, auto-dismiss 5s |
| Warning toast | Cancel any transaction | Yellow toast, auto-dismiss 5s |
| Error toast | Trigger any error | Red toast, auto-dismiss 8s |
| Dismiss toast | Click X on toast | Toast immediately removed |
| Multiple toasts | Trigger multiple actions | Toasts stack correctly |

### 4.2 Error Recovery
| Test | Steps | Expected Result |
|------|-------|-----------------|
| Retry after error | Click "Try Again" on error | Action retries |
| Clear error on input | Change input after error | Error clears |
| UI never stuck | Trigger various errors | Always able to retry or cancel |

---

## 5. Cross-Browser Tests

| Browser | Version | Test Suite |
|---------|---------|------------|
| Chrome | Latest | Full |
| Firefox | Latest | Full |
| Safari | Latest | Core flows |
| Edge | Latest | Core flows |
| Mobile Chrome | Latest | Core flows |
| Mobile Safari | Latest | Core flows |

---

## 6. Network Conditions Tests

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Slow network | Throttle to 3G | Loading states visible, no timeouts |
| Offline | Disable network | "Network error" shown, retry after reconnect |
| Intermittent | Toggle network | Graceful error handling |

---

## 7. Security Verification

### 7.1 Non-Custodial Verification
| Check | Method | Expected |
|-------|--------|----------|
| No private keys sent | Inspect network tab | Only public data transmitted |
| Transaction signing | Verify in wallet | All signing happens in wallet popup |
| Address verification | Check displayed addresses | Match connected wallet |

### 7.2 UI Security
| Check | Method | Expected |
|-------|--------|----------|
| No sensitive data in URL | Check URL params | No keys/secrets in URL |
| Secure explorer links | Verify external links | HTTPS only, legitimate explorers |
| XSS protection | Test input fields | All inputs sanitized |

---

## Automated Test Commands (Future)

```bash
# Run Playwright tests
npm run test:e2e

# Run specific test suite
npm run test:e2e -- --grep "wallet"

# Run in headed mode
npm run test:e2e -- --headed

# Generate test report
npm run test:e2e -- --reporter=html
```

---

## Test Environment Setup

1. Install MetaMask browser extension
2. Create test wallet with testnet funds
3. Configure backend to testnet endpoints
4. Ensure sufficient test tokens for swaps

---

## Sign-Off Checklist

- [ ] All wallet connection tests pass
- [ ] All swap flow tests pass
- [ ] All withdrawal flow tests pass
- [ ] Toast notifications work correctly
- [ ] Error handling graceful and recoverable
- [ ] No console errors during normal operation
- [ ] Build completes without errors
- [ ] Security checks verified
