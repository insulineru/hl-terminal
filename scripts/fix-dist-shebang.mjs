/**
 * The dev entry is TypeScript (`#!/usr/bin/env bun`). zile copies that shebang
 * into dist/index.js, but the published file is plain ESM: no `Bun` globals and
 * no `bun:` imports. Node can run it, so the published shebang is node.
 * A Node-only `npx hl-terminal` then works. Developing from src still uses bun.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2] ?? 'dist/index.js'
const text = readFileSync(file, 'utf8')
const body = text.startsWith('#!') ? text.slice(text.indexOf('\n') + 1) : text

if (body.includes("from 'bun:") || body.includes('from "bun:') || /\bBun\./.test(body)) {
  console.error(`${file} uses Bun-only APIs; refusing to switch the shebang to node`)
  process.exit(1)
}

writeFileSync(file, `#!/usr/bin/env node\n${body}`)
