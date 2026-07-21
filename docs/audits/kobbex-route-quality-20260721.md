# Kobbex P22 Route Quality Audit — 2026-07-21

## Result

- Certified directional routes observed: **46**
- Route-size observations: **138**
- Static-call quote failures: **0**
- Network broadcasts: **0**
- Status counts: **UNKNOWN_DATA=138**

## Accounting

Every passing source quote proves `gross - commission = net` using the wrapper-returned integer values. Minimum received is calculated from net output at 50 bps slippage.

## Data-quality warning

The current wrapper quote ABI returns output and gas units, but not a trustworthy pool mid-price, USD conversion, or pool liquidity. The audit therefore records these fields as unknown rather than claiming healthy execution economics.

## Evidence

- JSON: `artifacts/route-quality/20260721T004200742Z/route-quality.json`
- CSV: `artifacts/route-quality/20260721T004200742Z/route-quality.csv`
- Source commission audit: `reports/commission-pair-audit-20260721.json`
