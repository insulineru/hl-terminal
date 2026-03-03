---
phase: 02-trade-execution
plan: 03
subsystem: api
tags: [hyperliquid, exchange-client, leverage, tp, sl, trigger-orders, position-management]

# Dependency graph
requires:
  - phase: 02-trade-execution
    plan: 01
    provides: resolveAsset() coin-to-assetId resolution, formatPrice re-export, exchange.ts utilities, c.var.exchange middleware injection
provides:
  - position sub-CLI (Cli.create('position')) with leverage, tp, sl commands in src/commands/position.ts
  - hl position leverage COIN VALUE [--isolated] — sets cross/isolated leverage via exchange.updateLeverage()
  - hl position tp COIN --price X — position-level take-profit trigger order with auto-detected side
  - hl position sl COIN --price X — position-level stop-loss trigger order with auto-detected side
  - placeTriggerOrder() shared helper for TP/SL DRY principle
affects: [03-watch-mode, agent-usage]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TP/SL auto-detect position direction by fetching clearinghouseState and reading szi (positive=long, negative=short)
    - Shared placeTriggerOrder() helper extracted for DRY principle — tp and sl commands call same helper with tpsl param
    - grouping 'positionTpsl' with s '0' for position-level trigger orders that scale with position size
    - Trigger price validated against current allMids() before submission to prevent invalid TP/SL direction

key-files:
  created: [src/commands/position.ts]
  modified: [src/index.ts]

key-decisions:
  - "placeTriggerOrder() helper shared by tp and sl commands — both commands have identical logic except tpsl param and price validation direction"
  - "Trigger price validation happens before dry-run check to catch invalid inputs early"
  - "s: '0' with grouping 'positionTpsl' scales TP/SL with position size — matches Hyperliquid frontend behavior"
  - "READ_ONLY_ACCOUNT guard fires before dry-run check — security over convenience"

patterns-established:
  - "Shared trigger order helper: placeTriggerOrder(c, coin, price, tpsl, dryRun) called by both tp and sl commands"
  - "Position direction: szi > 0 means long (sell to close = b:false), szi < 0 means short (buy to close = b:true)"
  - "allMids() used for current price validation before submitting trigger orders"

requirements-completed: [TRAD-05, TRAD-06, TRAD-07]

# Metrics
duration: 3min
completed: 2026-03-04
---

# Phase 02 Plan 03: Position Management Commands Summary

**Position-level leverage, take-profit, and stop-loss trigger orders with auto-detected position direction from clearinghouseState and price validation against current mid**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T22:52:18Z
- **Completed:** 2026-03-03T22:55:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/commands/position.ts` with `Cli.create('position')` sub-CLI pattern
- Implemented `position leverage` command using `exchange.updateLeverage()` with cross/isolated mode switching, conflicting flags guard, dry-run support
- Implemented `position tp` and `position sl` commands that auto-detect position side from `clearinghouseState`, validate trigger price against current mid via `allMids()`, and place trigger orders using `exchange.order()` with `grouping: 'positionTpsl'` and `s: '0'`
- Extracted shared `placeTriggerOrder()` helper to avoid duplicating position detection, direction logic, and order execution between tp and sl commands
- Registered position sub-CLI in `src/index.ts` via `cli.command(position)`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create position sub-CLI with leverage command** - `dbd6343` (feat)
2. **Task 2: TP/SL commands (included in Task 1 position.ts) + registration in index.ts** - `880c9a7` (feat, part of 02-02 commit that also handled position registration)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `src/commands/position.ts` - New file: `Cli.create('position')` sub-CLI with leverage, tp, sl commands and shared placeTriggerOrder() helper (317 lines)
- `src/index.ts` - Added import and `cli.command(position)` registration after order command

## Decisions Made

- Extracted `placeTriggerOrder()` as a shared async function inside position.ts — both tp and sl call it with different `tpsl` param ('tp' | 'sl') and the validation logic flips accordingly; avoids ~80 lines of duplication
- Used `s: '0'` with `grouping: 'positionTpsl'` for position-level triggers — this is the pattern Hyperliquid uses for triggers that scale proportionally with position size (matching frontend behavior)
- Trigger price validated before dry-run to surface input errors eagerly — a user passing an invalid price for a dry-run gets the error immediately rather than seeing a phantom success
- `READ_ONLY_ACCOUNT` guard fires first before dry-run — this is intentional: watch accounts should never see a dry-run result for trade operations

## Deviations from Plan

None - plan executed exactly as written. All three commands (leverage, tp, sl) implemented with the exact patterns specified in the plan interfaces.

## Issues Encountered

None. The implementation matched the plan specification precisely. The TypeScript `run(c: any)` annotation pattern (established in previous plans) was applied consistently.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Position management commands complete; all of Phase 2 trade execution commands are now implemented (order create/cancel/cancel-all from 02-02, position leverage/tp/sl from 02-03)
- No blockers for Phase 3 (watch mode)
- All three checks pass: `bun run check && bun run check:types && bun run knip`

## Self-Check: PASSED

- `src/commands/position.ts` - EXISTS (317 lines)
- `.planning/phases/02-trade-execution/02-03-SUMMARY.md` - EXISTS
- Commit `dbd6343` (Task 1: position sub-CLI with leverage) - EXISTS
- All checks pass: `bun run check && bun run check:types && bun run knip`

---

*Phase: 02-trade-execution*
*Completed: 2026-03-04*
