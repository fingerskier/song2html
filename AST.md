# Song AST and deterministic importers

`Song AST` is the canonical structured song model used by parsing, validation, creation, transposition, rendering normalization, and MCP import operations. The existing default `songToHtml(source, arrangement)` API remains available for compatibility.

## Pipeline

```text
song2html source ─→ parseSong() ─→ Song AST ─┬─→ validateSong()
                                             ├─→ serializeSong()
                                             ├─→ transposeSongAst()
                                             ├─→ standalone/fragment rendering
                                             └─→ MCP and editor JSON

external chart ─→ detectFormat() ─→ deterministic importer ─→ Song AST
```

## Public JavaScript API

The package root exports these named operations:

```js
import songToHtml, {
  createSongAst,
  parseSong,
  validateSong,
  serializeSong,
  transposeSongAst,
  semanticSong,
  parseKey,
  parseChord,
  detectFormat,
  importSong,
} from 'song2html'
```

### Parse and validate

```js
const { song, diagnostics } = parseSong(source)
const additionalDiagnostics = validateSong(song)
```

Diagnostics have stable codes, severity, source location, and—where applicable—a node ID:

```js
{
  severity: 'error',
  code: 'UNKNOWN_SECTION_REFERENCE',
  type: 'unknown-section-reference',
  message: 'Arrangement references unknown section "Verse 9"',
  location: { line: 18, column: 1, length: 11 },
  nodeId: 'arrangement-full-1'
}
```

### Serialize and round-trip

```js
const canonicalSource = serializeSong(song)
const reparsed = parseSong(canonicalSource)
```

For supported canonical source, `semanticSong(reparsed.song)` equals `semanticSong(song)`. `semanticSong()` removes source locations, original spelling, and provenance before comparison.

### Transpose

```js
const shifted = transposeSongAst(song, 2)
```

The operation transforms structured key, named chord root, and named bass-note fields. Nashville degrees remain degrees and therefore follow the transposed key when rendered.

## Model outline

```js
{
  type: 'song',
  version: 1,
  metadata: {
    title: 'Amazing Grace',
    key: { tonic: 'G', mode: 'major' },
    tempo: 72,
    timeSignature: '3/4',
    authors: ['John Newton'],
    owner: null,
    license: 'Public Domain'
  },
  chordDefinitions: [{
    id: 'chords-verse-1',
    name: 'verse',
    progression: [{
      type: 'chord',
      notation: 'named',
      root: 'G',
      quality: '',
      bass: null
    }]
  }],
  sections: [{
    id: 'section-verse-1-1',
    name: 'Verse 1',
    chordDefinitionId: 'chords-verse-1',
    transpose: 0,
    lines: [{
      type: 'lyricLine',
      parts: [
        { type: 'chordEvent', progressionIndex: 0 },
        { type: 'lyric', text: 'Amazing grace' }
      ]
    }]
  }],
  arrangements: [{
    id: 'arrangement-full-1',
    name: 'Full',
    entries: [{ sectionId: 'section-verse-1-1', transpose: 0 }]
  }],
  provenance: { format: 'song2html' }
}
```

Keys, named chords, Nashville degrees, bass notes, sections, and arrangement references are structured rather than inferred repeatedly from opaque strings. Sections have stable IDs independent of display names.

## Importing external formats

```js
const candidates = detectFormat(source)
const result = importSong(source, {
  format: 'auto', // or an explicit format
  sourceName: 'chart.pro',
  title: 'optional override',
  key: 'optional override'
})
```

Supported formats:

- `chordpro` — directives and inline chord events
- `inline-brackets` — `[G]lyric [C]placement`
- `opensong` — OpenSong XML metadata and chord-bearing lyrics
- `chords-over-lyrics` — chord columns mapped onto the following lyric line
- `song2html` — canonical parsing and serialization

The result includes:

```js
{
  detectedFormat,
  confidence,
  candidates,
  song,
  song2htmlSource,
  diagnostics,
  mapping
}
```

Importers preserve every observed chord event in source order. They do not simplify progressions, infer repeated patterns, or silently invent metadata. Ambiguous column alignment, unsupported directives, unknown chords, conflicting structure, and out-of-range placement are diagnostics rather than hidden model decisions.

Auto-detection refuses to choose when the top candidates are too close. Pass an explicit `format` to resolve that case.

## MCP

Two tools extend the original eight:

- `detect_format` returns ranked candidates and evidence.
- `import_song` returns the AST, canonical song2html source, diagnostics, confidence, provenance, and optional original mapping.

`parse_song` and `read_song_file` accept `include: ['ast']`. `create_song`, `validate_song`, `transpose_song`, write validation, library listing, and render normalization use the shared AST operations.

## Compatibility boundary

The default `songToHtml()` function and its historical return shape are preserved. It remains the compatibility fragment renderer while new structured operations are available as named exports. This permits consumers to migrate incrementally without forcing a major-version API break.
