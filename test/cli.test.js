import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const NODE_CLI = [process.execPath, resolve('bin/song2html.js')]
// Set S2H_NATIVE_BIN to a built cli/target/*/song2html to check the Rust binary matches.
const NATIVE_CLI = process.env.S2H_NATIVE_BIN ? [resolve(process.env.S2H_NATIVE_BIN)] : null

const run = ([command, ...prefix], args, input) => {
  const result = spawnSync(command, [...prefix, ...args], { input, encoding: 'utf8' })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status }
}

const SONG = 'Grace [G]\n  verse: 1 4 5/2\n\nSections:\n  Verse:\n    A^mazing ^grace ^now\n'
const BROKEN = 'Bad [H]\nSections:\n  V:\n    ^x\n'

const CASES = [
  [['-t', 'preview'], SONG],
  [['-t', 'fragment', '--capo', '2'], SONG],
  [['-t', 'song2html', '--transpose', '-2'], SONG],
  [['-t', 'song2html', '--transpose', '+2'], SONG],
  [['-t', 'json'], SONG],
  [['-t', 'song2html'], '{title: X}\n{key: D}\n{sov}\n[D]Hi [G]there\n{eov}\n'],
  [['--check'], BROKEN],
  [['--check', '--diagnostics', 'json', '-q'], BROKEN],
  [['--strict', '-t', 'arrangements'], BROKEN],
  [['-t', 'pdf'], SONG],
]

test('node CLI converts, previews, and reports diagnostics with stable exit codes', () => {
  const preview = run(NODE_CLI, ['-t', 'preview'], SONG)
  assert.equal(preview.status, 0)
  assert.match(preview.stdout, /A\[1\]mazing \[4\]grace \[5\/2\]now/)
  assert.match(run(NODE_CLI, ['-t', 'song2html', '--transpose', '-2'], SONG).stdout, /^Grace \[F]/)
  assert.match(run(NODE_CLI, ['--capo', '2', '-t', 'fragment'], SONG).stdout, /\(F shapes\)/)

  const check = run(NODE_CLI, ['--check', '--diagnostics', 'json'], BROKEN)
  assert.equal(check.status, 1)
  assert.equal(check.stdout, '')
  const report = JSON.parse(check.stderr)
  assert.equal(report.file, '<stdin>')
  assert.equal(report.diagnostics[0].code, 'INVALID_KEY')

  assert.equal(run(NODE_CLI, ['-t', 'html'], SONG).status, 2)
  assert.equal(run(NODE_CLI, ['--capo', '12'], SONG).status, 2)
  assert.match(run(NODE_CLI, ['--help'], '').stdout, /--diagnostics <FORMAT>/)
})

test('node CLI writes one file per input with --out-dir', async () => {
  const out = await mkdtemp(join(tmpdir(), 'song2html-cli-'))
  try {
    const result = run(NODE_CLI, ['test/fixtures/simple-song.txt', 'test/fixtures/flat-key.txt', '-d', out, '-q'], '')
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual((await readdir(out)).sort(), ['flat-key.html', 'simple-song.html'])
    assert.match(await readFile(join(out, 'flat-key.html'), 'utf8'), /^<!DOCTYPE html>/)
    assert.equal(run(NODE_CLI, ['test/fixtures/simple-song.txt', 'test/fixtures/flat-key.txt'], '').status, 2)
  } finally {
    await rm(out, { recursive: true, force: true })
  }
})

test('native and node CLIs produce identical output', { skip: !NATIVE_CLI && 'set S2H_NATIVE_BIN to compare' }, () => {
  for (const [args, input] of CASES) {
    const native = run(NATIVE_CLI, args, input)
    const node = run(NODE_CLI, args, input)
    assert.equal(native.status, node.status, args.join(' '))
    if (native.status === 2) continue // usage wording differs between clap and parseArgs
    assert.equal(native.stdout, node.stdout, args.join(' '))
    assert.equal(native.stderr, node.stderr, args.join(' '))
  }
})

const CLIS = [['node', NODE_CLI], ['native', NATIVE_CLI]].filter(([, cli]) => cli)

test('CLIs accept +N, refuse colliding --out-dir targets, and stop quietly on a closed pipe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'song2html-cli-'))
  try {
    await mkdir(join(dir, 'a'))
    await mkdir(join(dir, 'b'))
    await writeFile(join(dir, 'a', 'song.txt'), SONG)
    await writeFile(join(dir, 'b', 'song.txt'), SONG)
    // Large enough that the reader closes before the writer finishes.
    await writeFile(join(dir, 'big.txt'), SONG + '    how sweet the sound that saved a wretch like me\n'.repeat(5000))
    for (const [name, cli] of CLIS) {
      assert.match(run(cli, ['-t', 'song2html', '--transpose', '+2'], SONG).stdout, /^Grace \[A]/, name)

      const out = join(dir, `out-${name}`)
      const collide = run(cli, [join(dir, 'a', 'song.txt'), join(dir, 'b', 'song.txt'), '-d', out], '')
      assert.equal(collide.status, 2, name)
      assert.match(collide.stderr, /would both write/, name)
      await assert.rejects(readdir(out), name)

      const [command, ...prefix] = cli
      const piped = spawnSync('sh', ['-c', '"$@" | head -c 1 >/dev/null', 'sh', command, ...prefix, join(dir, 'big.txt')], { encoding: 'utf8' })
      assert.equal(piped.status, 0, name)
      assert.equal(piped.stderr, '', name)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
