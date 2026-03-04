---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
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
  - src/incur.generated.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Version in index.ts matches package.json (0.3.0)"
    - "All commands have examples array showing realistic usage"
    - "Trade-mutating commands have success CTAs guiding to logical next commands"
    - "Commands with common gotchas have hint strings"
    - "incur gen produces typed incur.generated.ts"
    - "Cli.create has sync config with suggestions and depth"
  artifacts:
    - path: "src/index.ts"
      provides: "Fixed version, sync config on Cli.create"
      contains: "version: '0.3.0'"
    - path: "src/incur.generated.ts"
      provides: "Generated types from incur gen"
  key_links:
    - from: "src/index.ts"
      to: "package.json"
      via: "version field match"
      pattern: "version: '0\\.3\\.0'"
---

<objective>
Improve incur best practices across the hyperliquid-cli codebase: fix version mismatch, add sync config, add examples/hints/success CTAs to all commands, and run incur gen for typed output.

Purpose: Better agent discovery (sync config, examples), better UX (hints, success CTAs), correctness (version match, typed gen output).
Output: All command files updated, incur.generated.ts created, version fixed.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/index.ts
@src/commands/price.ts
@src/commands/balance.ts
@src/commands/positions.ts
@src/commands/orders.ts
@src/commands/fills.ts
@src/commands/funding.ts
@src/commands/markets.ts
@src/commands/account.ts
@src/commands/order.ts
@src/commands/position.ts
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix version, add sync config, add examples/hints/CTAs to all commands</name>
  <files>src/index.ts, src/commands/price.ts, src/commands/balance.ts, src/commands/positions.ts, src/commands/orders.ts, src/commands/fills.ts, src/commands/funding.ts, src/commands/markets.ts, src/commands/account.ts, src/commands/order.ts, src/commands/position.ts</files>
  <action>
**src/index.ts:**
1. Change `version: '0.2.2'` to `version: '0.3.0'` to match package.json.
2. Add `sync` config to `Cli.create` options:
   ```ts
   sync: {
     suggestions: [
       'Check BTC price: hl price BTC',
       'View account balance: hl balance',
       'Place a market buy: hl order create BTC buy 0.001',
     ],
     depth: 1,
   },
   ```

**Add `examples` to every command that lacks them** (order create already has examples, skip it). Use realistic trading scenarios. Format: `{ args: {...}, options?: {...}, description: '...' }`.

- **price**: `{ args: { coin: 'BTC' }, description: 'Get BTC mid-price' }`, `{ args: { coin: 'ETH' }, description: 'Get ETH mid-price' }`
- **balance**: `{ description: 'View perps margin and spot wallet balances' }` (no args)
- **positions**: `{ description: 'View all open perp positions' }` (no args)
- **orders**: `{ description: 'View all open orders' }` (no args)
- **fills**: `{ args: { coin: 'BTC' }, options: { limit: 10 }, description: 'Last 10 BTC fills' }`, `{ options: { days: 7 }, description: 'All fills from last 7 days' }`
- **funding**: `{ args: { coin: 'BTC' }, description: 'BTC funding history (7 days)' }`, `{ description: 'Current funding rates for all coins' }`
- **markets**: `{ description: 'List all available perp markets' }` (no args)
- **account add**: `{ options: { name: 'main' }, description: 'Add a trading account' }`
- **account watch**: `{ args: { address: '0x...' }, options: { name: 'whale' }, description: 'Watch a wallet (read-only)' }`
- **account ls**: `{ description: 'List all configured accounts' }`
- **account rm**: `{ args: { name: 'old' }, description: 'Remove an account' }`
- **account switch**: `{ args: { name: 'main' }, description: 'Switch default account' }`
- **order cancel**: `{ args: { oid: 12345 }, description: 'Cancel order by ID' }`
- **order cancel-all**: `{ description: 'Cancel all open orders' }`, `{ options: { coin: 'BTC' }, description: 'Cancel all BTC orders' }`
- **position leverage**: `{ args: { coin: 'BTC', leverage: 10 }, description: 'Set 10x cross leverage on BTC' }`, `{ args: { coin: 'ETH', leverage: 5 }, options: { isolated: true }, description: '5x isolated leverage on ETH' }`
- **position tp**: `{ args: { coin: 'BTC' }, options: { price: '100000' }, description: 'Take-profit on BTC at $100k' }`
- **position sl**: `{ args: { coin: 'BTC' }, options: { price: '90000' }, description: 'Stop-loss on BTC at $90k' }`

**Add `hint` strings where helpful:**
- **account add**: `hint: 'Your private key is entered securely and never displayed. Pipe from a file: echo $KEY | hl account add --name main'`
- **position leverage**: `hint: 'Set leverage before placing orders. Cross margin is the default.'`
- **fills**: `hint: 'Use --days to filter by time range. Fills are aggregated by time.'`
- **funding**: `hint: 'Without a coin argument, fetches current rates for all markets (may take a few seconds).'`
- **balance**: `hint: 'Shows perps margin summary and non-zero spot token balances.'`
- **order cancel**: `hint: 'Find order IDs with: hl orders'`
- **order cancel-all**: `hint: 'Use --coin to cancel only orders for a specific market.'`
- **position tp**: `hint: 'Scales with position size. Auto-detects long/short direction.'`
- **position sl**: `hint: 'Scales with position size. Auto-detects long/short direction.'`

**Add success CTAs (cta field on c.ok() response) for trade-mutating commands:**
The incur `c.ok()` accepts an optional second argument for metadata including `cta`. Add `cta` to the success path of:
- **order create** (non-dry-run success): `cta: { commands: [{ command: 'orders', description: 'View open orders' }, { command: 'positions', description: 'View positions' }] }`
- **order cancel** (non-dry-run success): `cta: { commands: [{ command: 'orders', description: 'View remaining orders' }] }`
- **order cancel-all** (non-dry-run success): `cta: { commands: [{ command: 'orders', description: 'Confirm no remaining orders' }] }`
- **account add** success: `cta: { commands: [{ command: 'balance', description: 'Check account balance' }] }`
- **account watch** success: `cta: { commands: [{ command: 'balance', description: 'Check wallet balance' }] }`
- **account switch** success: `cta: { commands: [{ command: 'balance', description: 'View new account balance' }] }`
- **position leverage** (non-dry-run success): `cta: { commands: [{ command: 'order create', description: 'Place an order with new leverage' }] }`
- **position tp** (non-dry-run success): `cta: { commands: [{ command: 'orders', description: 'View trigger orders' }] }`
- **position sl** (non-dry-run success): `cta: { commands: [{ command: 'orders', description: 'View trigger orders' }] }`

For c.ok() CTAs, pass as second argument: `c.ok(data, { cta: { commands: [...] } })`. Check incur docs/types — if c.ok() does not accept a second arg, add cta to the data object itself under a `_cta` convention or skip CTAs on success (only add to error paths which already support it). Verify the incur API before committing to either approach.

**Do NOT change `c: any` typing in this task** — that is a known incur limitation for sub-CLI commands and the `any` is intentional per project decision [Plan 02-02].
  </action>
  <verify>
    <automated>bun run check && bun run check:types</automated>
  </verify>
  <done>
    - version in index.ts is '0.3.0'
    - Cli.create has sync config with suggestions and depth
    - All commands have examples arrays
    - Relevant commands have hint strings
    - Trade-mutating commands have success CTAs (if incur API supports it, otherwise documented why skipped)
    - check and check:types pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Run incur gen to produce typed definitions</name>
  <files>src/incur.generated.ts</files>
  <action>
Run `npx incur gen` from the project root. This should produce `src/incur.generated.ts` (or similar) with typed command definitions.

If the default output path is different, check the output and move/configure as needed. The generated file provides typed CTAs and command references for agent tooling.

After generation:
1. Verify the file was created and contains type exports
2. Add it to the project (do NOT gitignore it — it should be committed)
3. Run `bun run check && bun run check:types && bun run knip` to ensure it does not break linting or introduce unused exports warnings
4. If knip flags the generated file, add it to knip's ignore list in package.json or knip config
  </action>
  <verify>
    <automated>test -f src/incur.generated.ts && bun run check && bun run check:types && bun run knip</automated>
  </verify>
  <done>
    - src/incur.generated.ts exists with generated type definitions
    - All three checks pass (check, check:types, knip)
  </done>
</task>

</tasks>

<verification>
- `grep "version: '0.3.0'" src/index.ts` returns a match
- `grep "sync:" src/index.ts` returns a match
- `grep -l "examples:" src/commands/*.ts` returns all command files
- `test -f src/incur.generated.ts` exits 0
- `bun run check && bun run check:types && bun run knip` all pass
</verification>

<success_criteria>
- Version mismatch fixed (0.3.0 in both package.json and index.ts)
- sync config added to Cli.create with suggestions and depth
- All commands have examples arrays with realistic trading scenarios
- Commands with common gotchas have hint strings
- Trade-mutating commands guide agents to logical next steps via success CTAs
- incur.generated.ts exists and passes all checks
</success_criteria>

<output>
After completion, create `.planning/quick/1-improve-incur-best-practices-version-fix/1-SUMMARY.md`
</output>
