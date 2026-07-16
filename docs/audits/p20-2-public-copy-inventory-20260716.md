# P20.2 Public Copy Inventory

| String | Classification | Action |
|--------|----------------|--------|
| Swap amount is empty or zero | Internal leakage (was SR-only) | Replaced with public Enter an amount |
| Ready to swap + Connect wallet (idle) | Misleading when connected | Connected/disconnected idle specs |
| commission routing (swap surfaces) | Public leakage | Replaced with production-certified / liquidity availability |
| commission routing (Trust Center) | Technical disclosure | Retained |
| New Listings | Incorrect | Renamed Top Gainers |
| Liquidity Leaders | Incorrect (mcap ≠ liquidity) | Renamed Largest by Market Cap |
| Your monitored tokens are stable | Misleading at 0 watchlist | Empty watchlist copy |
| Aave Token (ethereum.json) | Inconsistent metadata | Canonicalized to Aave |
