---
phase: 02-trade-execution
plan: 02
subsystem: trading
tags: [hyperliquid, sdk, orders, cli, incur, exchange-client]

# Dependency graph
requires:
  - phase: 02-01
    provides: ExchangeClient factory, resolveAsset, formatPrice, formatSize utilities, middleware injection

provides:
  - order create command (limit + market + inline TP/SL + dry-run)
  - order cancel command (by OID, with dry-run)
  - order cancel-all command (optional coin filter, bulk cancel, dry-run)
  - order sub-CLI registered in main CLI

affects: [02-03, 03-watch-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cli.create('order') sub-CLI registered via cli.command(order)"
    - "run(c: any) type annotation for commands accessing c.var context"
    - "Market orders use allMids() + slippage calculation + FrontendMarket TIF"
    - "Limit orders map GTC/IOC/ALO to SDK Gtc/Ioc/Alo strings"
    - "TP/SL trigger orders use grouping: normalTpsl, opposite side, r: true"
    - "Dry-run guard before exchange call returns DRY_RUN status"

key-files:
  created:
    - src/commands/order.ts
  modified:
    - src/index.ts
    - knip.json
    - src/commands/position.ts
    - src/lib/client.ts

key-decisions:
  - "Market orders fetch mid price via allMids() and apply slippage % (default 3%) then use FrontendMarket TIF"
  - "TP/SL trigger orders are batched with main order using grouping: normalTpsl when --tp/--sl flags present"
  - "cancel-all builds coinToAssetId map from meta.universe to avoid N+1 resolveAsset calls"
  - "position.ts (created by 02-03 ahead of time) registered here with run(c: any) type fix"

patterns-established:
  - "run(c: any): Incur CLI commands that access c.var must type the context parameter as any"
  - "Read-only guard: check c.var.exchange at the start of every trade command"
  - "Dry-run gate: return c.ok with status: DRY_RUN before any exchange call"

requirements-completed: [TRAD-01, TRAD-02, TRAD-03, TRAD-04]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 2 Plan 02: Order Commands Summary

**`hl order create` (limit + market + TP/SL), `hl order cancel`, and `hl order cancel-all` implemented using @nktkas/hyperliquid ExchangeClient with dry-run support on all commands**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T22:51:47Z
- **Completed:** 2026-03-03T22:54:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Full order lifecycle: create (limit/market), cancel by OID, cancel all with optional coin filter
- Inline TP/SL trigger orders batched with main order using normalTpsl grouping
- Market orders compute slippage price from live allMids() feed with configurable % (default 3%)
- All commands: read-only account guard, dry-run preview mode, structured error responses
- All three quality checks pass: check (oxlint/oxfmt), check:types (tsc), knip

## Task Commits

Each task was committed atomically:

1. **Task 1: Create order sub-CLI with create command (limit + market + inline TP/SL)** - `15dc155` (feat)
2. **Task 2: Add cancel and cancel-all commands, register order sub-CLI** - `880c9a7` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/commands/order.ts` - Order sub-CLI with create, cancel, cancel-all sub-commands (466 lines)
- `src/index.ts` - Registered order (and position) sub-CLIs via cli.command()
- `knip.json` - Removed src/lib/exchange.ts from ignore list (now consumed by order.ts)
- `src/commands/position.ts` - Fixed run(c: any) type annotation (was run(c) causing TS errors)
- `src/lib/client.ts` - Reformatted by oxfmt (no logic change)

## Decisions Made

- Market orders fetch mid price from `allMids()` and compute slippage price (`mid * (1 ± slippage%)`). FrontendMarket TIF ensures market execution semantics.
- TP/SL trigger orders are bundled in the same `exchange.order()` call using `grouping: 'normalTpsl'`. Trigger orders use opposite side, reduce-only=true, and trigger object type.
- cancel-all builds a `Map<string, number>` from `meta.universe` to resolve all coins in one network call, avoiding N+1 resolveAsset calls.
- `run(c: any)` pattern adopted throughout because incur's context type inference doesn't propagate c.var types to sub-CLI command run functions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in position.ts (missing : any type annotation)**
- **Found during:** Task 2 verification (bun run check:types)
- **Issue:** position.ts had `run(c)` on two commands accessing c.var, causing TS2339 property errors
- **Fix:** Changed to `run(c: any)` matching the pattern used in all other c.var-accessing commands
- **Files modified:** src/commands/position.ts
- **Verification:** bun run check:types now exits 0
- **Committed in:** 880c9a7 (Task 2 commit)

**2. [Rule 3 - Blocking] Removed exchange.ts from knip ignore after it became consumed**
- **Found during:** Task 2 verification (bun run knip)
- **Issue:** knip.json had exchange.ts in ignore list per Plan 02-01 (exported but not yet consumed). Now consumed by order.ts, knip flagged it as a hint to remove from ignore.
- **Fix:** Removed src/lib/exchange.ts from knip.json ignore array
- **Files modified:** knip.json
- **Verification:** bun run knip now exits 0
- **Committed in:** 880c9a7 (Task 2 commit)

**3. [Rule 1 - Bug] Registered pre-existing position sub-CLI in index.ts**
- **Found during:** Task 2 verification (bun run knip - "Unused files: src/commands/position.ts")
- **Issue:** position.ts was created by plan 02-03 (ahead of time) but not registered in index.ts
- **Fix:** Added import and cli.command(position) registration
- **Files modified:** src/index.ts
- **Verification:** bun run knip exits 0
- **Committed in:** 880c9a7 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug fix, 1 blocking knip issue, 1 missing registration)
**Impact on plan:** All fixes necessary for correctness and quality checks to pass. No scope creep.

## Issues Encountered

- TypeScript does not infer c.var types in incur sub-CLI command handlers — must use `run(c: any)` pattern throughout. This is consistent with how positions.ts, balance.ts, etc. are written.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Order commands ready: limit orders, market orders, TP/SL triggers, cancel by OID, cancel all
- position sub-CLI (leverage, TP, SL commands) also registered (created by plan 02-03)
- Plan 02-03 (position commands) can proceed immediately — position.ts already exists and is registered

## Self-Check: PASSED

- src/commands/order.ts: FOUND
- src/index.ts: FOUND
- 02-02-SUMMARY.md: FOUND
- Commit 15dc155: FOUND
- Commit 880c9a7: FOUND

---
*Phase: 02-trade-execution*
*Completed: 2026-03-04*
