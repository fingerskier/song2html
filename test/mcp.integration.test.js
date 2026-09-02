import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const source = `Integration [Am]
  owner: Example Music
  license: CC0
  verse: 1 4 5/2

Sections:
  Verse:
    ^one ^four ^five`;

const parseText = (result) => JSON.parse(result.content[0].text)

test('all MCP tools execute through a real stdio client', async () => {
  const library = await mkdtemp(join(tmpdir(), 'song2html-mcp-'))
  const client = new Client({ name: 'song2html-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('bin/song2html-claude.js')],
    cwd: resolve('.'),
    env: { ...process.env, SONG2HTML_LIBRARY_ROOT: library },
    stderr: 'pipe',
  })

  try {
    await client.connect(transport)
    const tools = await client.listTools()
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
      'create_song', 'detect_format', 'import_song', 'list_song_files', 'parse_song', 'preview_song',
      'read_song_file', 'render_html', 'transpose_song', 'validate_song', 'write_song_file',
    ])

    const parsed = parseText(await client.callTool({ name: 'parse_song', arguments: { source, include: ['song', 'errata'] } }))
    assert.equal(parsed.song.key, 'Am')
    assert.equal(parsed.html, undefined)
    assert.deepEqual(parsed.errata, [])

    const structured = parseText(await client.callTool({ name: 'parse_song', arguments: { source, include: ['ast'] } }))
    assert.deepEqual(structured.ast.metadata.key, { tonic: 'A', mode: 'minor' })
    assert.equal(structured.ast.chordDefinitions[0].progression[2].bass.degree, 2)

    const warningOnly = parseText(await client.callTool({
      name: 'validate_song',
      arguments: { source: source.replace(' [Am]', '').replace(' 1 4 5/2', ' Am Dm Em/B') },
    }))
    assert.equal(warningOnly.valid, true)
    assert.equal(warningOnly.issues.some((issue) => issue.type === 'missing-key'), true)

    const created = parseText(await client.callTool({
      name: 'create_song',
      arguments: {
        title: 'Created', key: 'C', owner: 'Owner', license: 'CC0',
        chords: { verse: 'C G' }, sections: [{ name: 'Verse', lyrics: ['^hello ^world'] }],
      },
    }))
    assert.match(created.source, /owner: Owner/)
    assert.match(created.source, /license: CC0/)

    const path = join(library, 'integration.txt')
    const dryRun = parseText(await client.callTool({ name: 'write_song_file', arguments: { path, source, dryRun: true } }))
    assert.equal(dryRun.written, null)
    const written = parseText(await client.callTool({ name: 'write_song_file', arguments: { path, source } }))
    assert.equal(written.written, path)

    const read = parseText(await client.callTool({ name: 'read_song_file', arguments: { path, include: ['song'] } }))
    assert.equal(read.song.title, 'Integration')
    assert.equal(read.source, undefined)
    assert.equal(read.html, undefined)

    const s2hPath = join(library, 'integration.s2h')
    await client.callTool({ name: 'write_song_file', arguments: { path: s2hPath, source } })
    const listed = parseText(await client.callTool({ name: 'list_song_files', arguments: { directory: library } }))
    assert.equal(listed.count, 2)
    assert.equal(listed.songs.some((song) => song.file === 'integration.s2h'), true)
    assert.equal(listed.songs.every((song) => song.title === 'Integration'), true)

    const preview = parseText(await client.callTool({ name: 'preview_song', arguments: { source } }))
    assert.match(preview.text, /\[1\]one \[4\]four \[5\/2\]five/)

    const transposed = parseText(await client.callTool({ name: 'transpose_song', arguments: { source, steps: 2 } }))
    assert.equal(transposed.song.key, 'Bm')
    assert.deepEqual(transposed.ast.metadata.key, { tonic: 'B', mode: 'minor' })

    const chordPro = `{title: Imported}\n{key: G}\n{start_of_verse: Verse}\n[G]hello [C]world\n{end_of_verse}`
    const detected = parseText(await client.callTool({ name: 'detect_format', arguments: { source: chordPro } }))
    assert.equal(detected.candidates[0].format, 'chordpro')
    const imported = parseText(await client.callTool({ name: 'import_song', arguments: { source: chordPro, format: 'auto', includeOriginalMapping: true } }))
    assert.equal(imported.detectedFormat, 'chordpro')
    assert.deepEqual(imported.song.chordDefinitions[0].progression.map((chord) => chord.root), ['G', 'C'])
    assert.equal(imported.mapping[0].chordCount, 2)

    const rendered = await client.callTool({
      name: 'render_html',
      arguments: { source: source.replace('Integration', '</title><script>alert(1)</script>'), theme: 'stage' },
    })
    assert.doesNotMatch(rendered.content[0].text, /<title><\/title><script>/)
    assert.match(rendered.content[0].text, /data-s2h-theme="stage"/)
  } finally {
    await client.close()
    await rm(library, { recursive: true, force: true })
  }
})
