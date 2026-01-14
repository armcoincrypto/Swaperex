# Edge Case Testing Checklist

These tests verify the app handles unusual or error conditions gracefully.

---

## 1. Wallet Edge Cases

### 1.1 MetaMask Locked
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Connect wallet normally | Connected | ☐ |
| 2 | Lock MetaMask (click account icon → Lock) | - | ☐ |
| 3 | Try to initiate swap | Error shown, or reconnect prompt | ☐ |
| 4 | Unlock MetaMask | Should reconnect or prompt to connect | ☐ |

### 1.2 Account Switch in MetaMask
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Connect with Account 1 | Address 1 shown | ☐ |
| 2 | In MetaMask, switch to Account 2 | UI updates to new address | ☐ |
| 3 | Verify balances refresh | New account balances shown | ☐ |

### 1.3 Multiple Wallet Popups
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Click "Connect Wallet" | Popup opens | ☐ |
| 2 | Without responding, click "Connect Wallet" again | Should not open duplicate | ☐ |
| 3 | Cancel the popup | Returns to normal state | ☐ |

### 1.4 Slow Wallet Response
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Click "Connect Wallet" | "Connecting..." shown | ☐ |
| 2 | Wait 10+ seconds without responding | Loading state maintained | ☐ |
| 3 | Eventually approve | Connects successfully | ☐ |

---

## 2. Swap Edge Cases

### 2.1 Zero Amount
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter `0` in amount field | Button shows "Enter Amount" | ☐ |
| 2 | Enter `0.0` | Same behavior | ☐ |
| 3 | Enter `0.00000` | Same behavior | ☐ |

### 2.2 Very Small Amount
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter `0.000000001` | Quote fetched or "Amount too small" error | ☐ |
| 2 | Check output display | Handles small decimals correctly | ☐ |

### 2.3 Very Large Amount
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter `999999999999` | "Insufficient balance" shown | ☐ |
| 2 | Check UI | No overflow/layout issues | ☐ |

### 2.4 Invalid Amount Input
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Try typing letters: `abc` | Only numbers accepted | ☐ |
| 2 | Try special chars: `!@#` | Only numbers accepted | ☐ |
| 3 | Try multiple decimals: `1.2.3` | Only one decimal allowed | ☐ |
| 4 | Try negative: `-5` | Not accepted or handled | ☐ |

### 2.5 Same Token Swap
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Select ETH as "From" | Selected | ☐ |
| 2 | Select ETH as "To" | Should prevent or warn | ☐ |

### 2.6 Quote During Network Issue
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter valid swap amount | Quote loading | ☐ |
| 2 | Quickly go offline (DevTools) | - | ☐ |
| 3 | Check error | "Network error" displayed | ☐ |
| 4 | Go back online | Retry works | ☐ |

### 2.7 Rapid Amount Changes
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Quickly type `1`, `2`, `3`, `4`, `5` | Debounced quote fetch | ☐ |
| 2 | Check network tab | Not 5 separate requests | ☐ |
| 3 | Final quote matches `12345` | Correct amount quoted | ☐ |

### 2.8 Approval Already Given
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Complete a token swap with approval | Success | ☐ |
| 2 | Try same swap again | Should skip approval step | ☐ |

---

## 3. Withdrawal Edge Cases

### 3.1 Paste Address
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Copy a valid address to clipboard | - | ☐ |
| 2 | Paste into destination field | Address appears correctly | ☐ |
| 3 | Validation runs | No error for valid address | ☐ |

### 3.2 ENS Name (if supported)
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter `vitalik.eth` | Resolves or shows error | ☐ |
| 2 | If resolved | Shows resolved address | ☐ |

### 3.3 Checksum Address
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter lowercase address | Accepted | ☐ |
| 2 | Enter checksummed address | Accepted | ☐ |
| 3 | Enter mixed case (invalid checksum) | Should still work (not strict) | ☐ |

### 3.4 Contract Address as Destination
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enter known contract address | Warning or allowed | ☐ |
| 2 | Check for warning | May warn about sending to contract | ☐ |

### 3.5 Withdraw Full Balance
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Click MAX | Full balance entered | ☐ |
| 2 | For native token (ETH) | May need to leave gas | ☐ |
| 3 | Check gas warning | If applicable, shows warning | ☐ |

---

## 4. Modal Edge Cases

### 4.1 Click Outside Modal
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open preview modal | Modal displayed | ☐ |
| 2 | Click on dark overlay | Modal closes (if not in loading state) | ☐ |

### 4.2 Press Escape Key
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open preview modal | Modal displayed | ☐ |
| 2 | Press Escape key | Modal closes (if not in loading state) | ☐ |

### 4.3 Modal During Transaction
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Confirm swap, transaction pending | Loading state | ☐ |
| 2 | Try to close modal | Should NOT close | ☐ |
| 3 | Try clicking outside | Should NOT close | ☐ |
| 4 | Try pressing Escape | Should NOT close | ☐ |

### 4.4 Browser Refresh During Transaction
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Confirm transaction in wallet | Transaction sent | ☐ |
| 2 | Refresh browser | State resets (tx still on chain) | ☐ |
| 3 | Transaction should still complete | (Blockchain handles it) | ☐ |

---

## 5. Toast Edge Cases

### 5.1 Multiple Toasts
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Trigger multiple actions quickly | Multiple toasts stack | ☐ |
| 2 | Check layout | Toasts don't overlap | ☐ |
| 3 | Each dismisses independently | Older ones dismiss first | ☐ |

### 5.2 Long Toast Message
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Trigger error with long message | Toast displays | ☐ |
| 2 | Check text | Truncated or wrapped properly | ☐ |
| 3 | Toast still closeable | X button accessible | ☐ |

---

## 6. Network Edge Cases

### 6.1 Slow Network (3G)
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | DevTools → Network → Slow 3G | Throttled | ☐ |
| 2 | Get swap quote | Loading shown longer | ☐ |
| 3 | Quote eventually arrives | Success | ☐ |

### 6.2 Intermittent Connection
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Start quote fetch | Loading | ☐ |
| 2 | Toggle offline/online quickly | - | ☐ |
| 3 | Check behavior | Error or retry gracefully | ☐ |

### 6.3 Backend Down (500 Error)
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | If backend returns 500 | - | ☐ |
| 2 | Check UI | "Server error" or similar message | ☐ |
| 3 | Retry button available | User can try again | ☐ |

---

## 7. Browser Edge Cases

### 7.1 Private/Incognito Mode
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Open app in private window | App loads | ☐ |
| 2 | Connect wallet | Works normally | ☐ |
| 3 | No localStorage issues | Handles gracefully | ☐ |

### 7.2 LocalStorage Full
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Fill localStorage near quota | - | ☐ |
| 2 | Use app normally | Handles gracefully | ☐ |

### 7.3 Popup Blocker
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Enable popup blocker | - | ☐ |
| 2 | Try to connect wallet | MetaMask uses extension, should work | ☐ |

---

## 8. Accessibility Edge Cases

### 8.1 Keyboard Navigation
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Tab through form fields | Focus visible | ☐ |
| 2 | Tab to buttons | Buttons focusable | ☐ |
| 3 | Press Enter on button | Activates button | ☐ |

### 8.2 Screen Reader
| Step | Action | Expected | ✓ |
|------|--------|----------|---|
| 1 | Navigate with screen reader | Labels read correctly | ☐ |
| 2 | Toasts announced | Notifications read | ☐ |

---

## Results Summary

| Category | Tests | Passed | Failed | Blocked |
|----------|-------|--------|--------|---------|
| 1. Wallet | 4 | ☐ | ☐ | ☐ |
| 2. Swap | 8 | ☐ | ☐ | ☐ |
| 3. Withdrawal | 5 | ☐ | ☐ | ☐ |
| 4. Modal | 4 | ☐ | ☐ | ☐ |
| 5. Toast | 2 | ☐ | ☐ | ☐ |
| 6. Network | 3 | ☐ | ☐ | ☐ |
| 7. Browser | 3 | ☐ | ☐ | ☐ |
| 8. Accessibility | 2 | ☐ | ☐ | ☐ |

---

## Critical Issues Found

| # | Description | Severity | Status |
|---|-------------|----------|--------|
| | | | |

**Tested by:** _______________
**Date:** _______________
