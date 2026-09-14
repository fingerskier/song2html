import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const source = `Tool [G]
  verse: G C

Sections:
  Verse:
    ^hello ^world`

function runTool(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'bin', 'song2html-tool.js'), name], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
    child.stdin.end(JSON.stringify(args))
  })
}

test('song2html-tool parse_song and detect_format match MCP payloads', async () => {
  const parsed = await runTool('parse_song', { source, include: ['song', 'errata'] })
  assert.equal(parsed.code, 0, parsed.stderr)
  const body = JSON.parse(parsed.stdout)
  assert.equal(body.song.key, 'G')
  assert.equal(body.html, undefined)
  assert.deepEqual(body.errata, [])

  const detected = await runTool('detect_format', { source: '{title: Hi}\\n[G]hello' })
  assert.equal(detected.code, 0, detected.stderr)
  assert.equal(JSON.parse(detected.stdout).candidates[0].format, 'chordpro')
})

test('song2html-tool rejects unknown tools', async () => {
  const result = await runTool('not_a_tool', {})
  assert.equal(result.code, 1)
  assert.match(result.stderr, /Unknown tool/)
})
