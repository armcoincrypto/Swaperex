# P20.1 Trade Preparation Compact Design

## Structure
`TradePreparationPanel` → `getTradePreparationSummary(items)` compact row + accordion checklist grouped Ready / Pending / Needs attention.

## Priority (presentation)
Network mismatch → token warn → slippage warn → quote pending → ready counts.

## Accessibility
Expand button: `aria-expanded`, `aria-controls`, 44px min touch target.

## Default collapse
Collapsed unless `expandByDefault` from warn state at mount.
