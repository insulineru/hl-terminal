---
"hl-terminal": patch
---

Pinned incur to 0.3.13 so a fresh install no longer crashes while loading the MCP transport. Boolean flags accept true/false (including equals form and yes/no/1/0) without treating those words as a price, and flags without a `--no-*` form drop a false value instead of crashing. HTTP 429 from Hyperliquid is reported as RATE_LIMITED with a retry hint, including when a builder-dex query is rate limited. Trigger output names take-profit orders, and an immediate fill points at positions instead of cancel. The published CLI runs on Node.
