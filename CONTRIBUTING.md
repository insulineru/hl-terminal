# Contributing

Thanks for your interest in contributing to hl-terminal! Every contribution helps make the Hyperliquid CLI better for everyone.

## Prerequisites

- [Bun](https://bun.sh) >= 1.0.0

## Getting Started

```bash
git clone https://github.com/insulineru/hyperliquid-cli.git
cd hyperliquid-cli
bun install
```

## Development Workflow

```bash
# Lint and format
bun run check

# Type check
bun run check:types

# Dead code detection
bun run knip

# Run tests
bun test

# Build
bun run build

# Run locally
bun run start
```

Run all checks before submitting a pull request:

```bash
bun run check && bun run check:types && bun run knip && bun test
```

## Coding Standards

This project uses [oxfmt](https://github.com/nicolo-ribaudo/oxfmt) for formatting and [oxlint](https://oxc.rs/docs/guide/usage/linter) for linting.

**Formatting** (`.oxfmtrc.jsonc`):

- No semicolons
- Single quotes
- Trailing commas
- 100 character line width
- 2-space indentation

**Linting** (`.oxlintrc.json`):

- TypeScript plugin enabled
- Correctness rules enforced as errors

Both run together via `bun run check`.

## Pull Requests

1. **Discuss first** — significant API or architecture changes should be discussed in an issue before opening a PR
2. **PR titles** — use imperative mood: "Add balance command", "Fix funding rate parsing"
3. **Changeset descriptions** — use past tense: "Added balance command", "Fixed funding rate parsing"
4. **Keep PRs focused** — one feature or fix per PR
5. **Run checks** — all of `bun run check`, `bun run check:types`, `bun run knip`, and `bun test` must pass

## Adding a Changeset

This project uses [Changesets](https://github.com/changesets/changesets) for version management. If your PR includes user-facing changes, add a changeset:

```bash
bun run changeset
```

Choose the appropriate bump type:

- **patch** — bug fixes
- **minor** — new features (backward-compatible)
- **major** — breaking changes

The changeset will be consumed during the next release to update the version and changelog automatically.
