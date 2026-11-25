---
"hl-terminal": patch
---

Pinned incur to 0.3.13 so a fresh install no longer crashes while loading the MCP transport. Boolean flags accept a spaced true/false, and `--flag=value` also accepts 1/0/yes/no, without treating those words as a price. A spaced 1, 0, yes, or no stays a positional. Flags without a `--no-*` form drop a false value instead of crashing, and the last occurrence wins. HTTP 429 from Hyperliquid is reported as RATE_LIMITED with a retry hint, including when a builder-dex query is rate limited. Trigger output names take-profit orders, and an immediate fill points at positions instead of cancel. The published CLI runs on Node.
