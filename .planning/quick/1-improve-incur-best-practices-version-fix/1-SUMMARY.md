---
phase: quick
plan: 1
subsystem: cli-commands
tags: [incur, best-practices, version, examples, hints, cta]
dependency_graph:
  requires: []
  provides: [incur-best-practices, typed-command-registry]
  affects: [all-commands]
tech_stack:
  added: []
  patterns: [incur-examples, incur-hints, incur-success-cta, incur-sync-config]
key_files:
  created:
    - src/incur.generated.ts
  modified:
    - src/index.ts
    - src/commands/price.ts
    - src/commands/balance.ts
    - src/commands/positions.ts
    - src/commands/orders.ts
    - src/commands/fills.ts
    - src/commands/funding.ts
    - src/commands/markets.ts
    - src/commands/account.ts
    - src/commands/order.ts
    - src/commands/position.ts
    - knip.json
decisions:
  - "c.ok() accepts second meta arg with cta field -- used for all success CTAs"
  - "incur.generated.ts placed in src/ and added to knip ignore (declaration file)"
metrics:
  duration: ~5 min
  completed: 2026-03-04
---

# Quick Task 1: Improve incur Best Practices and Version Fix

Version fixed to 0.3.0, sync config added, examples/hints/CTAs on all commands, typed incur.generated.ts produced.

## Task Summary

| Task | Name | Commit | Status |
| ---- | ---- | ------ | ------ |
| 1 | Fix version, add sync config, examples/hints/CTAs | 7a6cb95 | Done |
| 2 | Run incur gen for typed definitions | ee33eec | Done |

## What Was Done

### Task 1: Version, Sync, Examples, Hints, CTAs

- **Version fix**: Changed `version: '0.2.2'` to `version: '0.3.0'` in src/index.ts to match package.json
- **Sync config**: Added `sync: { suggestions: [...], depth: 1 }` to Cli.create for agent discovery
- **Examples**: Added `examples` arrays to all 15 command definitions (price, balance, positions, orders, fills, funding, markets, account add/watch/ls/rm/switch, order cancel/cancel-all, position leverage/tp/sl). Order create already had examples.
- **Hints**: Added `hint` strings to 9 commands: balance, fills, funding, account add, order cancel, order cancel-all, position leverage/tp/sl
- **Success CTAs**: Added `c.ok(data, { cta: { commands: [...] } })` to 9 trade-mutating success paths: order create, order cancel, order cancel-all, account add, account watch, account switch, position leverage, position tp, position sl

### Task 2: incur gen

- Ran `bun run node_modules/.bin/incur gen` (npx/bunx failed due to .ts extension; bun direct execution worked)
- Generated `src/incur.generated.ts` with typed command registry (module augmentation for `incur`)
- Added `src/incur.generated.ts` to knip ignore list (declaration file, not imported directly)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] package.json missing scripts (zile build artifact)**
- **Found during:** Task 1 verification
- **Issue:** package.json on disk was a zile-stripped build artifact missing scripts/devDependencies
- **Fix:** Restored from `git show HEAD:package.json`
- **Files modified:** package.json (restored, not committed -- matches git HEAD)

**2. [Rule 3 - Blocking] incur gen fails with npx/bunx**
- **Found during:** Task 2
- **Issue:** `npx incur gen` and `bunx incur gen` fail with "Unknown file extension .ts"
- **Fix:** Used `bun run node_modules/.bin/incur gen` instead
- **Files modified:** None (tooling workaround)

**3. [Rule 3 - Blocking] incur gen outputs to project root**
- **Found during:** Task 2
- **Issue:** File generated at `./incur.generated.ts` instead of `src/`
- **Fix:** Moved file to `src/incur.generated.ts` per plan specification
- **Files modified:** src/incur.generated.ts

## Verification

- `grep "version: '0.3.0'" src/index.ts` -- PASS
- `grep "sync:" src/index.ts` -- PASS
- All 10 command files have `examples:` -- PASS (10/10)
- `test -f src/incur.generated.ts` -- PASS
- `bun run check` -- PASS
- `bun run check:types` -- PASS
- `bun run knip` -- PASS

## Self-Check: PASSED

All 13 files verified present. Both commits (7a6cb95, ee33eec) verified in git log.
