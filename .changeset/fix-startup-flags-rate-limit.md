---
"hl-terminal": patch
---

Pinned incur to 0.3.13 so a fresh install no longer crashes while loading the MCP transport. Boolean flags now accept a spaced true or false, and those words are no longer parsed as a price. HTTP 429 from Hyperliquid is reported as RATE_LIMITED with a retry hint. Trigger output names take-profit orders, and an immediate fill points at positions instead of cancel.
