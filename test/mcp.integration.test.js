import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const source = `Integration [Am]
  owner: Example Music
  license: CC0
  verse: 1 4 5/2

Sections:
  Verse:
    ^one ^four ^five`

const parseText = (result) => JSON.parse(result.content[0].text)

test('the four MCP tools execute through a real stdio client', async () => {
  const client = new Client({ name: 'song2html-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('bin/song2html-mcp.js')],
    cwd: resolve('.'),
    stderr: 'pipe',
  })

  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    const definitions = JSON.parse(await readFile('tools.json', 'utf8'))
    assert.deepEqual(tools.map((tool) => tool.name), ['import_song', 'validate_song', 'preview_song', 'render_html'])
    assert.deepEqual(tools.map((tool) => tool.inputSchema), definitions.map((tool) => tool.inputSchema))
    assert.ok(tools.every((tool) => tool.annotations.readOnlyHint))

    const valid = parseText(await client.callTool({ name: 'validate_song', arguments: { source } }))
    assert.equal(valid.valid, true)
    assert.equal(valid.song.key, 'Am')
    assert.deepEqual(valid.arrangements, ['default'])
    assert.deepEqual(valid.diagnostics, [])
    const warningOnly = parseText(await client.callTool({ name: 'validate_song', arguments: { source: source.replace(' [Am]', '') } }))
    assert.equal(warningOnly.valid, true)
    assert.ok(warningOnly.diagnostics.some((entry) => entry.code === 'MISSING_KEY'))

    const preview = parseText(await client.callTool({ name: 'preview_song', arguments: { source } }))
    assert.match(preview.text, /\[1\]one \[4\]four \[5\/2\]five/)

    const chordPro = `{title: Imported}\n{key: G}\n{start_of_verse: Verse}\n[G]hello [C]world\n{end_of_verse}`
    const imported = parseText(await client.callTool({ name: 'import_song', arguments: { source: chordPro, include: ['ast', 'mapping'] } }))
    assert.equal(imported.detectedFormat, 'chordpro')
    assert.match(imported.song2htmlSource, /verse: G C/)
    assert.deepEqual(imported.ast.chordDefinitions[0].progression.map((chord) => chord.root), ['G', 'C'])
    assert.equal(imported.mapping[0].chordCount, 2)
    const transposed = parseText(await client.callTool({ name: 'import_song', arguments: { source, format: 'song2html', transpose: 2 } }))
    assert.match(transposed.song2htmlSource, /^Integration \[Bm]/)
    const unknown = parseText(await client.callTool({ name: 'import_song', arguments: { source: 'plain prose' } }))
    assert.equal(unknown.song2htmlSource, null)
    assert.equal(unknown.diagnostics[0].code, 'UNKNOWN_FORMAT')

    const rendered = await client.callTool({
      name: 'render_html',
      arguments: { source: source.replace('Integration', '</title><script>alert(1)</script>'), theme: 'stage', capo: 3 },
    })
    assert.doesNotMatch(rendered.content[0].text, /<title><\/title><script>/)
    assert.match(rendered.content[0].text, /data-s2h-theme="stage"/)
    assert.match(rendered.content[0].text, /F#m shapes/)
    const fragment = await client.callTool({ name: 'render_html', arguments: { source, fragment: true, arrangement: 'Missing' } })
    assert.match(fragment.content[0].text, /^<article class="s2h-song">/)
    assert.match(fragment.content[1].text, /UNKNOWN_ARRANGEMENT/)

    const invalid = await client.callTool({ name: 'import_song', arguments: { source, transpose: 1.5 } })
    assert.equal(invalid.isError, true)
    assert.match(invalid.content[0].text, /must be an integer/)
    const missing = await client.callTool({ name: 'parse_song', arguments: { source } })
    assert.equal(missing.isError, true)
  } finally {
    await client.close()
  }
})
