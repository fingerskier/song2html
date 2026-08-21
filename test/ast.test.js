import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  createSongAst, detectFormat, importSong, parseChord, parseSong,
  semanticSong, serializeSong, transposeSongAst,
} from '../index.js'

const fixtures = join(import.meta.dirname, 'fixtures')

test('canonical song2html fixtures round-trip through the Song AST', async () => {
  for (const file of (await readdir(fixtures)).filter((name) => name.endsWith('.txt'))) {
    const source = await readFile(join(fixtures, file), 'utf8')
    const first = parseSong(source)
    const canonical = serializeSong(first.song)
    const second = parseSong(canonical)
    assert.deepEqual(semanticSong(second.song), semanticSong(first.song), file)
    assert.equal(second.diagnostics.some((entry) => entry.severity === 'error'), false, `${file}: ${JSON.stringify(second.diagnostics)}`)
  }
})

test('AST structures keys, chords, locations, stable section IDs, and arrangements', () => {
  const parsed = parseSong(`Structured [F#m]
  verse: 5/2 C#m7 G-BCD
Sections:
  Verse 1:
    ^one ^two ^three
  Verse 1:
    ^other
Arrangements:
  Full:
    Verse 1`)
  assert.deepEqual(parsed.song.metadata.key, { tonic: 'F#', mode: 'minor' })
  assert.deepEqual(parsed.song.chordDefinitions[0].progression[0].bass, { type: 'scaleDegree', degree: 2 })
  assert.equal(parsed.song.chordDefinitions[0].progression[1].quality, 'm7')
  assert.equal(parsed.song.sections[0].id === parsed.song.sections[1].id, false)
  assert.equal(parsed.song.sections[0].lines[0].parts[0].location.line, 5)
  assert.equal(parsed.diagnostics.some((entry) => entry.code === 'AMBIGUOUS_SECTION_REFERENCE'), true)
})

test('AST transposition changes structured keys and named chord roots, not Nashville degrees', () => {
  const ast = createSongAst({
    title: 'Transpose', key: 'C', chords: { verse: 'C/E 5/2 Am7' },
    sections: [{ name: 'Verse', lyrics: ['^one ^two ^three'] }],
  })
  const shifted = transposeSongAst(ast, 2)
  assert.deepEqual(shifted.metadata.key, { tonic: 'D', mode: 'major' })
  assert.equal(shifted.chordDefinitions[0].progression.map((chord) => chord.notation === 'nashville' ? `${chord.degree}/${chord.bass.degree}` : `${chord.root}${chord.quality}${chord.bass ? `/${chord.bass.note}` : ''}`).join(' '), 'D/F# 5/2 Bm7')
  assert.match(serializeSong(shifted), /verse: D\/F# 5\/2 Bm7/)
})

test('chord parser rejects ordinary words while accepting supported chord forms', () => {
  assert.equal(parseChord('Amazing').notation, 'unknown')
  assert.equal(parseChord('grace').notation, 'unknown')
  for (const token of ['C', 'F#m7', 'Bbmaj7', 'G/D', '5/2', 'Gsus4', 'Cadd9', 'G-BCD', 'F\\A']) {
    assert.notEqual(parseChord(token).notation, 'unknown', token)
  }
})

test('ChordPro imports deterministically with exact chord order and placement', () => {
  const source = `{title: Amazing Grace}
{key: G}
{artist: John Newton}
{start_of_verse: Verse 1}
[G]Amazing [C]grace, how [G]sweet the [D]sound
{end_of_verse}`
  const detected = detectFormat(source)
  assert.equal(detected[0].format, 'chordpro')
  const imported = importSong(source, { format: 'auto', sourceName: 'grace.pro' })
  assert.equal(imported.detectedFormat, 'chordpro')
  assert.equal(imported.song.metadata.title, 'Amazing Grace')
  assert.deepEqual(imported.song.metadata.authors, ['John Newton'])
  assert.deepEqual(imported.song.chordDefinitions[0].progression.map((chord) => chord.root), ['G', 'C', 'G', 'D'])
  assert.match(imported.song2htmlSource, /\^Amazing \^grace, how \^sweet the \^sound/)
  assert.equal(imported.song.provenance.sourceName, 'grace.pro')
})

test('inline bracket importer preserves every observed chord event', () => {
  const imported = importSong(`[Verse 1]
[G]Amazing [C]grace [G]again [D]home`, { format: 'inline-brackets', title: 'Inline', key: 'G' })
  assert.deepEqual(imported.song.chordDefinitions[0].progression.map((chord) => chord.root), ['G', 'C', 'G', 'D'])
  assert.equal((imported.song2htmlSource.match(/\^/g) || []).length, 4)
})

test('chords-over-lyrics importer maps source columns and reports ambiguity', () => {
  const source = `Aligned
[Verse]
G      C         D
Amazing grace is home`
  const imported = importSong(source, { format: 'chords-over-lyrics', key: 'G' })
  assert.deepEqual(imported.song.chordDefinitions[0].progression.map((chord) => chord.root), ['G', 'C', 'D'])
  assert.equal(imported.mapping[0].sourceLine, 3)
  assert.equal(imported.diagnostics.some((entry) => entry.code === 'AMBIGUOUS_CHORD_ALIGNMENT'), true)
})

test('OpenSong XML imports metadata and chord-bearing lyrics', () => {
  const source = `<song><title>XML Song</title><author>A Writer</author><key>D</key><copyright>Public Domain</copyright><lyrics>[Verse]
[D]Hello [G]world</lyrics></song>`
  const imported = importSong(source, { format: 'opensong', sourceName: 'song.xml' })
  assert.equal(imported.song.metadata.title, 'XML Song')
  assert.deepEqual(imported.song.metadata.key, { tonic: 'D', mode: 'major' })
  assert.deepEqual(imported.song.metadata.authors, ['A Writer'])
  assert.deepEqual(imported.song.chordDefinitions[0].progression.map((chord) => chord.root), ['D', 'G'])
  assert.equal(imported.song.provenance.format, 'opensong')
})

test('format detection refuses unknown and explicitly ambiguous inputs', () => {
  const unknown = importSong('ordinary prose with no chord chart syntax', { format: 'auto' })
  assert.equal(unknown.song, null)
  assert.equal(unknown.diagnostics[0].code, 'UNKNOWN_FORMAT')
})

test('parser remains total over deterministic malformed-input corpus', () => {
  let seed = 0x5eed
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0)
  const alphabet = 'ABCxyz123[]{}:^/\\()\n  '
  for (let sample = 0; sample < 250; sample++) {
    let source = ''
    const length = next() % 300
    for (let index = 0; index < length; index++) source += alphabet[next() % alphabet.length]
    const parsed = parseSong(source)
    assert.equal(parsed.song.type, 'song')
    assert.ok(Array.isArray(parsed.diagnostics))
  }
})

test('AST and importer front doors enforce source limits', () => {
  const oversized = 'x'.repeat(1_000_001)
  assert.throws(() => parseSong(oversized), /source exceeds/)
  assert.throws(() => detectFormat(oversized), /source exceeds/)
})
