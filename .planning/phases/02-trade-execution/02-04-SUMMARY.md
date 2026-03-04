---
phase: 02-trade-execution
plan: "04"
subsystem: cli
tags: [incur, order, positional-args, examples, hint, readme, documentation]

# Dependency graph
requires:
  - phase: 02-trade-execution
    provides: order create/cancel/cancel-all and position leverage/tp/sl commands
provides:
  - order create price as optional 4th positional arg (hl order create BTC buy 0.001 95000)
  - order create examples array with limit, market, and TP/SL patterns
  - order create hint text for self-correcting error messages
  - README Trade Execution and Position Management command tables
  - README Quick Start with trade command examples
affects: [phase-3-watch-mode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "incur examples/hint: add examples[] and hint fields to command definition for user guidance"
    - "positional optional arg: z.string().optional() in args z.object for optional positional CLI arg"

key-files:
  created: []
  modified:
    - src/commands/order.ts
    - README.md

key-decisions:
  - "price as positional arg (not --price flag): matches natural CLI conventions for trading (hl order create BTC buy 0.001 95000)"
  - "examples array on command definition: incur renders these in --help output and on validation errors"
  - "hint field on command definition: displayed on validation errors to guide user toward correct invocation"

patterns-established:
  - "UAT gap closure pattern: move flags to positional args + add examples/hint for UX polish"

requirements-completed: [TRAD-01, TRAD-02, INFR-02]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 2 Plan 04: UAT Gap Closure Summary

**order create price moved to positional arg with examples/hint, README updated with full Phase 2 command reference**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-03T23:41:00Z
- **Completed:** 2026-03-03T23:46:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- price moved from `--price` option flag to 4th optional positional arg, enabling natural `hl order create BTC buy 0.001 95000` syntax
- Added 3 examples (limit, market, market+TP/SL) and hint text to order create for self-correcting --help and validation errors
- README updated with Trade Execution and Position Management command tables covering all 6 Phase 2 commands
- README Quick Start section now includes trade command examples

## Task Commits

Each task was committed atomically:

1. **Task 1: Move price to positional arg and add examples/hint to order create** - `321642e` (feat)
2. **Task 2: Update README with Phase 2 trade and position commands** - `807b273` (docs)

**Plan metadata:** (docs commit pending)

## Files Created/Modified

- `src/commands/order.ts` - price moved from options to args, examples/hint added, run() updated to use c.args.price
- `README.md` - Trade execution feature bullet, Quick Start examples, Trade Execution and Position Management tables

## Decisions Made

- price as positional arg (not --price flag): matches natural CLI conventions for trading commands
- examples array on command definition: incur renders these in --help output and on validation errors, providing zero-friction onboarding
- hint field on command definition: displayed on validation errors to guide user toward correct invocation pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 Trade Execution is fully complete (4/4 plans done, UAT gaps closed)
- All 6 Phase 2 commands documented in README
- order create now has natural positional price arg matching user expectations
- Ready to begin Phase 3 (live streaming with WebSocket watch mode)

---
*Phase: 02-trade-execution*
*Completed: 2026-03-04*
