import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  bin: { 'hl-terminal': string }
  dependencies: { incur: string }
  scripts: { release: string }
}
const releaseScript = readFileSync(new URL('../../scripts/release.sh', import.meta.url), 'utf8')

describe('publish manifest', () => {
  test('pins incur to the exact release whose MCP transport loads', () => {
    expect(pkg.dependencies.incur).toBe('0.3.13')
  })

  test('keeps the ./src bin prefix zile needs, and fixes bins at publish time', () => {
    // npm pkg fix strips "./". Doing that here makes zile emit dist/src/index.js.
    // scripts/release.sh runs npm pkg fix after the build and restores package.json on failure.
    expect(pkg.bin['hl-terminal']).toBe('./src/index.ts')
    expect(pkg.scripts.release).toBe('./scripts/release.sh')
    expect(releaseScript).toContain('npm pkg fix')
    expect(releaseScript).toContain('package.json.bak package.json')
  })
})
