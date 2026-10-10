import test from 'node:test'
import assert from 'node:assert/strict'
import songToHtml, {
  createSongAst, importSong, parseChord, parseSong, renderSongHtml, renderStandalone,
  semanticSong, serializeSong, transposeSongAst,
} from '../index.js'
import { convert } from '../src/cli.js'

const sups = (html) => [...html.matchAll(/<sup class="s2h-chord">([^<]*)<\/sup>/g)].map((match) => match[1])
const roundTrips = (song) => assert.deepEqual(semanticSong(parseSong(serializeSong(song)).song), semanticSong(song))

test('imported songs keep every chord through song2html source', () => {
  const chordPro = `{title: Test}
{key: G}
{start_of_verse}
[G]Hello [C]world
{end_of_verse}
{start_of_chorus}
[D]Sing [G]out
{end_of_chorus}
{start_of_verse}
[Em]Again [C]now
{end_of_verse}
{chorus}
{start_of_verse}
[G]Third [C]time
{end_of_verse}`
  const imported = importSong(chordPro, { format: 'chordpro' })
  roundTrips(imported.song)
  assert.deepEqual(imported.song.sections.map((section) => section.name), ['Verse', 'Chorus', 'Verse 2', 'Verse 3'])
  assert.match(imported.song2htmlSource, /verse2: Em C/)
  assert.match(imported.song2htmlSource, /Verse 2:\n {4}<chords verse2>/)
  // Identical progressions share one definition; {chorus} becomes an arrangement entry.
  assert.equal(imported.song.chordDefinitions.length, 3)
  const rendered = songToHtml(imported.song2htmlSource)
  assert.deepEqual(sups(rendered.html), ['G', 'C', 'D', 'G', 'Em', 'C', 'D', 'G', 'G', 'C'])
  assert.equal(rendered.errata.filter((entry) => entry.severity === 'error').length, 0)
  assert.deepEqual(sups(renderStandalone(imported.song).page), sups(rendered.html))
})

test('every importer output round-trips through the parser', () => {
  const sources = [
    ['inline-brackets', '[Verse 1]\n[G]Amazing [C]grace\n[Chorus]\n[D]How [G]sweet\n[Verse 2]\n[Em]Was [C]blind'],
    ['chords-over-lyrics', 'My Song\n\nIntro\nG  C  D  G\n\nVerse 1:\nG       C\nHello there world\n| G | C |\nmore words: here\n'],
    ['opensong', '<song><title>OS</title><key>G</key><presentation>V1 C V1</presentation><lyrics>[V1]\n.G        C       G\n Amazing grace how sweet\n[C]\n.D    G\n Sing out\n</lyrics></song>'],
  ]
  for (const [format, source] of sources) {
    const imported = importSong(source, { format, key: 'G' })
    roundTrips(imported.song)
    assert.ok(sups(songToHtml(imported.song2htmlSource).html).every(Boolean), format)
  }
})

test('chords-over-lyrics keeps instrumental lines, bar lines, and colon-ended lyrics', () => {
  const imported = importSong('My Song\n\nIntro\nG  C  D  G\n\nVerse 1:\nG       C\nHello there world\n| G | C |\nmore words: here\nAm\nhe said:\n', { format: 'chords-over-lyrics', key: 'G' })
  assert.deepEqual(imported.song.sections.map((section) => section.name), ['Intro', 'Verse 1'])
  assert.deepEqual(imported.song.chordDefinitions.map((definition) => definition.progression.map((chord) => chord.raw)), [['G', 'C', 'D', 'G'], ['G', 'C', 'G', 'C', 'Am']])
  assert.match(imported.song2htmlSource, /\^he said:/)
})

test('OpenSong imports dot-prefixed chord lines and presentation order', () => {
  const imported = importSong('<song><title>OS</title><key>G</key><presentation>V1 C V1</presentation><lyrics>[V1]\n.G        C\n Amazing grace\n[C]\n.D    G\n Sing out\n</lyrics></song>', { format: 'opensong' })
  assert.deepEqual(imported.song.sections.map((section) => section.name), ['Verse 1', 'Chorus'])
  assert.deepEqual(imported.song.chordDefinitions[0].progression.map((chord) => chord.raw), ['G', 'C'])
  assert.deepEqual(imported.song.arrangements[0].entries.map((entry) => entry.name), ['Verse 1', 'Chorus', 'Verse 1'])
})

test('one parser: songToHtml, renderStandalone, and parseSong agree', () => {
  const source = `T [G]
  tempo: 72 bpm
  verse: G C

Sections:
  Verse 1:
    ^a ^b

Arrangements:
  Short
    Verse 1
    Verse 1
`
  const direct = songToHtml(source, 'Short')
  const parsed = parseSong(source)
  assert.equal(direct.song.tempo, 72)
  assert.equal(parsed.song.metadata.tempo, 72)
  assert.deepEqual(direct.arrangements, ['Short'])
  assert.equal(parsed.song.arrangements[0].entries.length, 2)
  assert.equal(renderStandalone(source, 'Short').page.split('class="s2h-section-title"').length - 1, 2)
  assert.equal(direct.html, renderSongHtml(parsed.song, { arrangement: 'Short' }).html)
})

test('reserved section, chord, and arrangement names warn and are ignored', () => {
  const source = `T [G]
  verse: G C
  constructor: D

Sections:
  Constructor:
    ^ignored
  toString:
    ^ignored too
  Verse:
    ^kept ^line

Arrangements:
  __proto__:
    Verse
  Main:
    Verse
    toString
`
  const result = songToHtml(source)
  const reserved = result.errata.filter((entry) => entry.code === 'RESERVED_NAME')
  assert.equal(reserved.length, 4)
  assert.ok(reserved.every((entry) => entry.severity === 'warning'))
  assert.deepEqual(result.arrangements, ['Main'])
  assert.deepEqual(sups(result.html), ['G', 'C'])
  assert.ok(!result.html.includes('ignored'))
  assert.ok(result.errata.some((entry) => entry.type === 'missing-section' && entry.section === 'toString'))
})

test('expansion limits apply to the parser and AST builder', () => {
  const big = `T [G]\n  verse: (${'G C D Em '.repeat(2000)}) x128\n\nSections:\n  Verse:\n    ^a\n`
  const started = performance.now()
  assert.throws(() => parseSong(big), /exceeds 10000 expanded chords/)
  assert.ok(performance.now() - started < 1000)
  assert.throws(() => songToHtml(big), RangeError)
  assert.throws(() => createSongAst({ title: 'x', chords: { verse: `(${'G '.repeat(200)}) x100` }, sections: [] }), RangeError)
})

test('transposition spells for the target key and moves every note', () => {
  const song = parseSong(`T [G]
  verse: G D/F# G-BCD F\\A Em7 (C D) x2

Sections:
  Verse:
    ^a ^b ^c ^d
`).song
  const shifted = serializeSong(transposeSongAst(song, 3))
  assert.match(shifted, /^T \[Bb]/)
  assert.match(shifted, /verse: Bb F\/A Bb-DEbF Ab\\C Gm7 \(Eb F\) x2/)
  assert.match(serializeSong(transposeSongAst(song, 1)), /^T \[Ab]/)
  assert.match(serializeSong(transposeSongAst(song, -1)), /^T \[F#]/)
  assert.throws(() => transposeSongAst(song, 1.5), TypeError)
})

test('Nashville degrees are spelled by scale letter, with explicit qualities and accidentals', () => {
  const chart = (key, progression) => sups(songToHtml(`T [${key}]\n  verse: ${progression}\n\nSections:\n  Verse:\n    ${'^x '.repeat(progression.split(' ').length)}\n`).html)
  assert.deepEqual(chart('F#', '1 4 7 3'), ['F#', 'B', 'E#dim', 'A#m'])
  assert.deepEqual(chart('Gb', '4 1'), ['Cb', 'Gb'])
  assert.deepEqual(chart('G', '6m 2m7 4maj7 5sus4 7 77'), ['Em', 'Am7', 'Cmaj7', 'Dsus4', 'F#dim', 'F#m7b5'])
  assert.deepEqual(chart('G', 'b7 #4dim b3 b6/1'), ['F', 'C#dim', 'Bb', 'Eb/G'])
  assert.deepEqual(chart('C', '5/2 1/3sus'), ['G/D', 'Csus/E'])
})

test('chord vocabulary covers common chart symbols', () => {
  for (const token of ['C7sus4', 'Cmadd9', 'C6/9', 'Csus2sus4', 'C°', 'Cø7', 'CΔ7', 'C+', 'Am7(b5)', 'E7#9', 'Bbmaj7/D', 'G|5', 'G-Bb']) {
    assert.equal(parseChord(token).notation, 'named', token)
  }
  assert.equal(parseChord('N.C.').notation, 'rest')
  assert.equal(parseChord('NC').notation, 'rest')
  assert.deepEqual([parseChord('b7').notation, parseChord('b7').degree, parseChord('b7').alter], ['nashville', 7, -1])
  for (const word of ['Amazing', 'grace', 'be', 'Add', 'Dim']) assert.equal(parseChord(word).notation, 'unknown', word)
})

test('capo renders shapes and can come from metadata or options', () => {
  const source = `T [Bb]
  capo: 3
  verse: Bb Eb/G 1 5

Sections:
  Verse:
    ^a ^b ^c ^d
`
  const fromMetadata = songToHtml(source)
  assert.equal(fromMetadata.song.capo, 3)
  assert.match(fromMetadata.html, /<strong>Capo:<\/strong> 3 <span class="s2h-capo-shapes">\(G shapes\)<\/span>/)
  assert.deepEqual(sups(fromMetadata.html), ['G', 'C/E', 'G', 'D'])
  assert.deepEqual(sups(songToHtml(source, '', { capo: 0 }).html), ['Bb', 'Eb/G', 'Bb', 'F'])
  assert.ok(songToHtml(source.replace('capo: 3', 'capo: 14')).errata.some((entry) => entry.code === 'INVALID_CAPO'))
  roundTrips(parseSong(source).song)
})

test('lyric lines ending in a colon stay inside their section', () => {
  const result = songToHtml(`T [C]
  verse: C G

Sections:
  Verse:
    ^And he ^said:
    then sang
`)
  assert.match(result.html, /he <sup class="s2h-chord">G<\/sup>said:/)
  assert.match(result.html, /then sang/)
})

test('serialization preserves repeat groups and multi-line chord definitions', () => {
  const source = `T [E]
  verse: (E A) x2 B E
    C#m B

Sections:
  Verse:
    ^a
`
  const { song } = parseSong(source)
  assert.match(serializeSong(song), /verse: \(E A\) x2 B E\n {4}C#m B/)
  assert.equal(song.chordDefinitions[0].progression.length, 8)
  roundTrips(song)
})

test('CLI engine converts, transposes, and reports errors', () => {
  const source = 'Grace [G]\n  verse: 1 4\n\nSections:\n  Verse:\n    ^a ^b\n'
  assert.match(convert({ source, to: 'page', theme: 'dark', capo: 2 }).output, /data-s2h-theme="dark"/)
  assert.match(convert({ source, to: 'song2html', transpose: 2 }).output, /^Grace \[A]/)
  assert.equal(convert({ source: '{title: X}\n[G]Hi', to: 'song2html' }).format, 'chordpro')
  assert.throws(() => convert({ source, to: 'pdf' }), /Unknown output format/)
})

test('parse → serialize → parse is stable over a deterministic structural corpus', () => {
  let seed = 7
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0)
  const parts = ['T [G]\n', '  verse: ', 'G C ', '(1 4) x2 ', 'b7 ', '\n', '    D Em\n', '  capo: 2\n', '  tempo: 90\n', 'Sections:\n', '  Verse 1:\n', '  Chorus:\n', '    ^la ^la\n', '    ends:\n', '    <transpose +2>\n', '    <chords verse>\n', '    <chords none>\n', 'Arrangements:\n', '  Main:\n', '  Alt\n', '    Verse 1\n', '    Chorus <transpose -1>\n', '    Missing\n', '\n']
  for (let sample = 0; sample < 1500; sample++) {
    let source = ''
    const length = next() % 30
    for (let index = 0; index < length; index++) source += parts[next() % parts.length]
    roundTrips(parseSong(source).song)
  }
})
