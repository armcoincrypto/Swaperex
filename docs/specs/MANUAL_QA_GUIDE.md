# Manual QA Execution Guide

## Prerequisites

### 1. Test Environment Setup
```bash
# Start the dev server
cd ~/Swaperex/frontend
npm run dev

# App runs at: http://localhost:3000
```

### 2. Wallet Setup
- Install MetaMask browser extension
- Create or import a test wallet
- Add testnet networks:
  - **Sepolia** (Ethereum testnet): Chain ID 11155111
  - **BSC Testnet**: Chain ID 97
  - **Mumbai** (Polygon testnet): Chain ID 80001

### 3. Get Testnet Tokens
- Sepolia ETH: https://sepoliafaucet.com
- BSC Testnet: https://testnet.bnbchain.org/faucet-smart
- Mumbai MATIC: https://faucet.polygon.technology

---

## Test Execution Checklist

### A. WALLET CONNECT FLOW

#### A1. Connect Wallet - Happy Path
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open app at localhost:3000 | See "Connect Wallet" button | ☐ |
| 2 | Click "Connect Wallet" | MetaMask popup opens | ☐ |
| 3 | Click "Connect" in MetaMask | Popup closes | ☐ |
| 4 | Check header | Address shown (0x1234...5678) | ☐ |
| 5 | Check status dot | Green indicator visible | ☐ |
| 6 | Check chain badge | Shows "ETH" or current chain | ☐ |

#### A2. Connect Wallet - User Rejection
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Disconnect if connected | Return to disconnected state | ☐ |
| 2 | Click "Connect Wallet" | MetaMask popup opens | ☐ |
| 3 | Click "Cancel" in MetaMask | Popup closes | ☐ |
| 4 | Check UI | Error message: "Connection cancelled" | ☐ |
| 5 | Check buttons | "Try Again" button visible | ☐ |
| 6 | Click "Try Again" | MetaMask popup opens again | ☐ |

#### A3. Chain Switch
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Connect on Sepolia testnet | Connected, chain badge shows | ☐ |
| 2 | In MetaMask, switch to BSC Testnet | UI updates automatically | ☐ |
| 3 | Check chain badge | Shows new chain (BSC) | ☐ |
| 4 | Switch to unsupported chain (e.g., Goerli) | Yellow warning banner appears | ☐ |
| 5 | Check banner message | "Switch to a supported network" | ☐ |
| 6 | Click "Switch Network" in banner | MetaMask network switch popup | ☐ |

#### A4. Read-Only Mode
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Disconnect wallet | Disconnected state | ☐ |
| 2 | Click "Or enter address to view" | Address input appears | ☐ |
| 3 | Enter: `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | Input accepts address | ☐ |
| 4 | Click "View" | "View Only" badge appears | ☐ |
| 5 | Try to initiate swap | Error: "Connect wallet to sign" or button disabled | ☐ |
| 6 | Click "Exit View Mode" | Returns to disconnected state | ☐ |

#### A5. Invalid Address in Read-Only
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Click "Or enter address to view" | Address input appears | ☐ |
| 2 | Enter: `invalid123` | - | ☐ |
| 3 | Click "View" | Error: "Invalid address format" | ☐ |
| 4 | Enter: `0xinvalid` | - | ☐ |
| 5 | Click "View" | Error: "Invalid address format" | ☐ |

#### A6. Disconnect Flow
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Connect wallet | Connected state | ☐ |
| 2 | Click on address dropdown | Menu opens | ☐ |
| 3 | Click "Disconnect" | Returns to disconnected state | ☐ |
| 4 | Check UI | "Connect Wallet" button visible | ☐ |

---

### B. SWAP FLOW

#### B1. Get Quote - Happy Path
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Connect wallet with testnet tokens | Connected | ☐ |
| 2 | Navigate to Swap tab | Swap form visible | ☐ |
| 3 | Select "From" token (ETH) | Token selected | ☐ |
| 4 | Select "To" token (USDT) | Token selected | ☐ |
| 5 | Enter amount: `0.01` | Amount entered | ☐ |
| 6 | Wait for quote | "Getting quote..." then output amount shows | ☐ |
| 7 | Check rate display | Shows exchange rate | ☐ |

#### B2. Preview Modal
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | With quote ready, click "Preview Swap" | Modal opens | ☐ |
| 2 | Check modal header | "Review Swap" title | ☐ |
| 3 | Check swap summary | From/To amounts visible | ☐ |
| 4 | Check countdown timer | "Quote expires in Xs" visible | ☐ |
| 5 | Check details | Rate, minimum received, slippage shown | ☐ |
| 6 | Check gas estimate | Network fee displayed | ☐ |
| 7 | Check security notice | "Transaction signed locally..." text | ☐ |

#### B3. Quote Expiry
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open preview modal | Timer starts at 30s | ☐ |
| 2 | Wait until timer < 10s | Timer turns yellow | ☐ |
| 3 | Wait until timer < 5s | Timer turns red | ☐ |
| 4 | Wait until timer = 0 | "Quote expired" shown | ☐ |
| 5 | Check Confirm button | Disabled | ☐ |
| 6 | Click "Refresh" | New quote fetched, timer resets | ☐ |

#### B4. Confirm Swap - User Rejection
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open preview modal with valid quote | Modal open | ☐ |
| 2 | Click "Confirm Swap" | MetaMask popup opens | ☐ |
| 3 | Click "Reject" in MetaMask | Popup closes | ☐ |
| 4 | Check modal | Shows "Transaction Cancelled" | ☐ |
| 5 | Check icon | Yellow X icon (not red error) | ☐ |
| 6 | Check buttons | "Close" button visible | ☐ |

#### B5. Insufficient Balance
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter amount greater than balance | E.g., `9999999` | ☐ |
| 2 | Check input border | Red border on "From" input | ☐ |
| 3 | Check error message | "Insufficient ETH balance" | ☐ |
| 4 | Check button | Shows "Insufficient ETH Balance", disabled | ☐ |

#### B6. High Price Impact
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter large swap amount | May cause high impact | ☐ |
| 2 | Check price impact display | Yellow if >1%, red if >3% | ☐ |
| 3 | Open preview modal | Warning banner visible if >3% | ☐ |
| 4 | If >10% impact | Red banner: "Very high price impact!" | ☐ |

---

### C. WITHDRAWAL FLOW

#### C1. Form Validation
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Navigate to Withdraw tab | Withdrawal form visible | ☐ |
| 2 | Click asset selector | Dropdown shows balances | ☐ |
| 3 | Select an asset with balance | Asset selected, balance shown | ☐ |
| 4 | Leave amount empty | Button shows "Enter Amount" | ☐ |
| 5 | Enter `0.001` | Amount accepted | ☐ |
| 6 | Leave address empty | Button shows "Enter Address" | ☐ |

#### C2. Address Validation
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter invalid address: `abc123` | Error: "Invalid address format" | ☐ |
| 2 | Enter own wallet address | Error: "Cannot send to your own address" | ☐ |
| 3 | Enter valid address: `0x742d35Cc6634C0532925a3b844Bc9e7595f1B8C1` | No error, button enabled | ☐ |

#### C3. Preview Withdrawal
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Complete form with valid inputs | "Preview Withdrawal" enabled | ☐ |
| 2 | Click "Preview Withdrawal" | Modal opens | ☐ |
| 3 | Check summary | Amount + asset displayed | ☐ |
| 4 | Check destination | Full address with copy button | ☐ |
| 5 | Check network fee | Fee estimate visible | ☐ |
| 6 | Click copy button | Address copied (check clipboard) | ☐ |

#### C4. Confirm Withdrawal - User Rejection
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open preview modal | Modal displayed | ☐ |
| 2 | Click "Confirm Withdrawal" | MetaMask popup opens | ☐ |
| 3 | Click "Reject" in MetaMask | Popup closes | ☐ |
| 4 | Check modal | "Transaction Cancelled" (yellow, not red) | ☐ |

#### C5. MAX Button
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Select asset with balance | Balance displayed | ☐ |
| 2 | Click "MAX" | Amount field fills with full balance | ☐ |
| 3 | Verify amount | Matches displayed balance | ☐ |

---

### D. ERROR HANDLING

#### D1. Toast Notifications
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Complete any successful action | Green success toast appears | ☐ |
| 2 | Wait 5 seconds | Toast auto-dismisses | ☐ |
| 3 | Reject any wallet action | Yellow warning toast appears | ☐ |
| 4 | Trigger any error | Red error toast appears | ☐ |
| 5 | Click X on toast | Toast immediately closes | ☐ |

#### D2. Network Offline
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open DevTools → Network → Offline | Network disabled | ☐ |
| 2 | Try to get swap quote | Error: "Network error..." | ☐ |
| 3 | Re-enable network | - | ☐ |
| 4 | Retry action | Should work | ☐ |

#### D3. Unsupported Chain Banner
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Connect on supported chain | No banner | ☐ |
| 2 | Switch MetaMask to unsupported chain | Yellow banner appears at top | ☐ |
| 3 | Check banner message | Lists supported networks | ☐ |
| 4 | Click "Switch Network" | MetaMask popup to switch | ☐ |
| 5 | Complete switch | Banner disappears | ☐ |

---

### E. CROSS-BROWSER TESTING

Run the core flow (Connect → Swap Preview → Disconnect) on each browser:

| Browser | Version | Connect | Swap Quote | Preview Modal | Toasts | Notes |
|---------|---------|---------|------------|---------------|--------|-------|
| Chrome | Latest | ☐ | ☐ | ☐ | ☐ | |
| Firefox | Latest | ☐ | ☐ | ☐ | ☐ | |
| Safari | Latest | ☐ | ☐ | ☐ | ☐ | |
| Edge | Latest | ☐ | ☐ | ☐ | ☐ | |

---

### F. MOBILE TESTING

| Test | MetaMask Mobile | WalletConnect | Notes |
|------|-----------------|---------------|-------|
| Open app in mobile browser | ☐ | ☐ | |
| Connect wallet | ☐ | ☐ | |
| View swap form | ☐ | ☐ | |
| Open preview modal | ☐ | ☐ | |
| Scroll modal content | ☐ | ☐ | |
| Close modal | ☐ | ☐ | |
| Toast visible on mobile | ☐ | ☐ | |

---

## Test Results Summary

| Category | Total Tests | Passed | Failed | Notes |
|----------|-------------|--------|--------|-------|
| A. Wallet Connect | 6 scenarios | ☐/6 | ☐ | |
| B. Swap Flow | 6 scenarios | ☐/6 | ☐ | |
| C. Withdrawal Flow | 5 scenarios | ☐/5 | ☐ | |
| D. Error Handling | 3 scenarios | ☐/3 | ☐ | |
| E. Cross-Browser | 4 browsers | ☐/4 | ☐ | |
| F. Mobile | 2 platforms | ☐/2 | ☐ | |

---

## Issues Found

| # | Severity | Category | Description | Steps to Reproduce | Status |
|---|----------|----------|-------------|-------------------|--------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## Sign-Off

- [ ] All A-D tests pass
- [ ] Cross-browser testing complete
- [ ] Mobile testing complete
- [ ] No critical issues found
- [ ] Ready for production

**Tested by:** _______________
**Date:** _______________
**Signature:** _______________
