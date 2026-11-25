import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'

const releaseScript = new URL('../../scripts/release.sh', import.meta.url).pathname
const dirs: string[] = []

function git(cwd: string, args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }
  return result.stdout.trim()
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hl-release-tag-'))
  dirs.push(dir)
  git(dir, ['init', '-b', 'main'])
  git(dir, ['config', 'user.email', 'release-test@example.com'])
  git(dir, ['config', 'user.name', 'release-test'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(dir, 'package.json'), '{"name":"dev"}\n')
  git(dir, ['add', 'package.json'])
  git(dir, ['commit', '-m', 'init'])
  return dir
}

function tagVersion(cwd: string, version: string) {
  const result = spawnSync(
    'bash',
    ['-c', `source '${releaseScript}'; ensure_release_tag '${version}'`],
    {
      cwd,
      encoding: 'utf8',
    },
  )
  return result
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('ensure_release_tag', () => {
  test('skips when changeset already tagged HEAD', () => {
    const dir = initRepo()
    git(dir, ['tag', '-a', 'v0.5.1', '-m', 'v0.5.1'])

    const result = tagVersion(dir, '0.5.1')

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Tag v0.5.1 already exists at HEAD')
    expect(git(dir, ['tag', '-l', 'v0.5.1'])).toBe('v0.5.1')
    expect(git(dir, ['rev-list', '-n', '1', 'v0.5.1'])).toBe(git(dir, ['rev-parse', 'HEAD']))
  })

  test('fails when the tag points at another commit', () => {
    const dir = initRepo()
    git(dir, ['tag', '-a', 'v0.5.1', '-m', 'v0.5.1'])
    writeFileSync(join(dir, 'note.txt'), 'next\n')
    git(dir, ['add', 'note.txt'])
    git(dir, ['commit', '-m', 'next'])

    const result = tagVersion(dir, '0.5.1')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Tag v0.5.1 already exists but points at')
    expect(result.stderr).toContain('not HEAD')
  })

  test('creates the tag when changeset did not', () => {
    const dir = initRepo()

    const result = tagVersion(dir, '0.5.2')

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Created tag v0.5.2')
    expect(git(dir, ['rev-list', '-n', '1', 'v0.5.2'])).toBe(git(dir, ['rev-parse', 'HEAD']))
  })

  test('the exit trap restores package.json on success and on failure', () => {
    const dir = initRepo()
    git(dir, ['tag', '-a', 'v0.5.1', '-m', 'v0.5.1'])
    const wrapped = `
      set -euo pipefail
      source '${releaseScript}'
      cp package.json package.json.bak
      trap 'mv package.json.bak package.json 2>/dev/null || true' EXIT
      echo '{"name":"built"}' > package.json
      ensure_release_tag "$1"
    `

    const skipped = spawnSync('bash', ['-c', wrapped, 'bash', '0.5.1'], {
      cwd: dir,
      encoding: 'utf8',
    })
    expect(skipped.status).toBe(0)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"name":"dev"')

    writeFileSync(join(dir, 'note.txt'), 'next\n')
    git(dir, ['add', 'note.txt'])
    git(dir, ['commit', '-m', 'next'])
    const failed = spawnSync('bash', ['-c', wrapped, 'bash', '0.5.1'], {
      cwd: dir,
      encoding: 'utf8',
    })
    expect(failed.status).toBe(1)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toContain('"name":"dev"')
    expect(failed.stderr).toContain('not HEAD')
  })
})
