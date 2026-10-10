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

test('song2html-tool validate_song and import_song match MCP payloads', async () => {
  const validated = await runTool('validate_song', { source })
  assert.equal(validated.code, 0, validated.stderr)
  const body = JSON.parse(validated.stdout)
  assert.equal(body.song.key, 'G')
  assert.deepEqual(body.diagnostics, [])

  const imported = await runTool('import_song', { source: '{title: Hi}\n{key: G}\n[G]hello' })
  assert.equal(imported.code, 0, imported.stderr)
  assert.equal(JSON.parse(imported.stdout).detectedFormat, 'chordpro')
})

test('song2html-tool rejects unknown tools and invalid arguments', async () => {
  const unknown = await runTool('not_a_tool', {})
  assert.equal(unknown.code, 1)
  assert.match(unknown.stderr, /Unknown tool/)
  const invalid = await runTool('render_html', { source, capo: 12 })
  assert.equal(invalid.code, 1)
  assert.match(invalid.stderr, /at most 11/)
})

test('song2html-tool keeps render errors on stderr and the HTML on stdout', async () => {
  const rendered = await runTool('render_html', { source, fragment: true, arrangement: 'Missing' })
  assert.equal(rendered.code, 0)
  assert.match(rendered.stdout, /^<article class="s2h-song">/)
  assert.equal(JSON.parse(rendered.stderr).errors[0].code, 'UNKNOWN_ARRANGEMENT')
})
