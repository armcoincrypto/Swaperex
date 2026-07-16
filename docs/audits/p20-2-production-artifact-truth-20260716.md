# P20.2 Production Artifact Truth

## Starting live state (pre-deploy)
- URL: https://dex.kobbex.com
- version.txt: `e5e002dbe6a27c28bcc3e911d0469f30ff7bc7e4`
- Branch marker: `release/swaperex-p20-1-compact-intelligence`
- HTML assets: `index-wDeqp-DR.js`, `index-CQshnP0k.css`, `vendor-react-w8jZXnmi.js`
- P20.1 compact intelligence confirmed in `TradingIntelligencePanel-DpErpT_w.js`
- No mixed `bd7dd94` / `2d2ad08` asset filenames on disk
- SPA route matrix: all primary routes HTTP 200 (client router)

## Consistency rule applied
Proven live requires version.txt + HTML refs + loaded chunk hashes + rendered strings.
