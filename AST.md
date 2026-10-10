# Song AST and deterministic importers

`Song AST` is the canonical structured song model used by parsing, validation, creation, transposition, rendering, the CLI, and MCP import operations. `parseSong()` is the only parser: `songToHtml(source, arrangement, options)` is `parseSong()` followed by `renderSongHtml()`.

## Pipeline

```text
song2html source ─→ parseSong() ─→ Song AST ─┬─→ validateSong()
                                             ├─→ serializeSong()
                                             ├─→ transposeSongAst()
                                             ├─→ renderSongHtml() / renderStandalone()
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

Diagnostics have stable codes, severity, source location, and—where applicable—a section name and node ID. `songToHtml()` errata use the same shape:

```js
{
  severity: 'error',
  code: 'MISSING_SECTION',
  type: 'missing-section',
  message: 'Section "Verse 9" referenced in arrangement "Full" but not defined in Sections',
  location: { line: 18, column: 1, length: 11 },
  line: 18,
  section: 'Verse 9',
  nodeId: 'arrangement-full-1'
}
```

Resource limits are exported as `LIMITS` and enforced by `parseSong()`, `createSongAst()`, and every importer.

### Serialize and round-trip

```js
const canonicalSource = serializeSong(song)
const reparsed = parseSong(canonicalSource)
```

For supported canonical source, `semanticSong(reparsed.song)` equals `semanticSong(song)`. This also holds for every importer's output: sections get unique, colon-free names and link to their chord definition explicitly (`<chords NAME>`) when the definition name differs from the section's first word. Repeat groups and multi-line chord definitions are kept (`lines`) and written back as authored. `semanticSong()` removes source locations, original spelling, and provenance before comparison.

### Transpose

```js
const shifted = transposeSongAst(song, 2)
```

The operation transposes the key and every named chord's root, bass, treble, and melody notes. The target key is spelled conventionally (G + 3 → Bb, never A#) and chord letters move with it. Nashville degrees remain degrees and therefore follow the transposed key when rendered. `steps` must be an integer.

### Render

```js
const { html, arrangements, song: meta, diagnostics } = renderSongHtml(song, { arrangement: 'Live', capo: 2 })
```

`capo` (0-11, overriding `metadata.capo`) renders shapes: named chords move down by the capo and Nashville degrees resolve in the shape key.

## Model outline

```js
{
  type: 'song',
  version: 2,
  metadata: {
    title: 'Amazing Grace',
    key: { tonic: 'G', mode: 'major' },
    tempo: 72,
    timeSignature: '3/4',
    authors: ['John Newton'],
    owner: null,
    license: 'Public Domain',
    capo: null
  },
  chordDefinitions: [{
    id: 'chords-verse-1',
    name: 'verse',
    // As written: one array per source line, with repeat groups kept.
    lines: [[
      { type: 'chord', notation: 'named', root: 'G', quality: '', bass: null, treble: null, melody: null, position: null },
      { type: 'repeat', times: 2, chords: [/* chord nodes */] }
    ]],
    // Expanded play order; chord events index into this.
    progression: [/* chord nodes */]
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

Chord nodes have `notation` `named` (`root`, `quality`, `bass: { type: 'note', note }`), `nashville` (`degree`, optional `alter` of ±1 for `b7`/`#4`, `quality`, `bass: { type: 'scaleDegree', degree, alter? }`), `rest` (`N.C.`), or `unknown` (`raw` only). Named and Nashville chords may carry `treble` (`{ type: 'note', note }` or `{ type: 'interval', interval }`), `melody` (array of `note`/`scaleDegree` items), and `position`. Chord-event `progressionIndex` counts across the whole section, matching how carets consume the progression. Arrangement entries are `{ sectionId, name, transpose }`; `transpose` is `null` when the entry does not override the section.

Version 2 replaced the chord `suffix` string with `treble` and `melody`, added `lines`, `capo`, and `alter`, and made `progressionIndex` section-wide.

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
- `opensong` — OpenSong XML: `.`-prefixed chord lines over lyric lines, `[V1]`/`[C]` section codes, and `<presentation>` order (inline `[G]` lyrics are also accepted)
- `chords-over-lyrics` — chord columns mapped onto the following lyric line. Default `align: 'word'` snaps whitespace hits to the next word and near-start hits to the word start, emitting diagnostics; `align: 'column'` keeps raw source columns. Chord-only lines become instrumental caret lines, bar-line charts such as `|G D Em D|` are tokenized as chords, tab-staff lines are skipped, tabs expand to `tabWidth` (default 8), and header fields `Key:`, `Tempo:`, `Time:`, `Author:`/`Artist:`/`Writer:` become metadata. A line directly under a chord line is lyric unless it is bracketed or a known section word.
- `chordpro` also reads `{tempo}`, `{time}`, `{capo}`, `label="…"` attributes, blank-line-separated paragraphs, and `{chorus}` (repeated in the arrangement); `{start_of_tab}`/`{start_of_grid}` blocks are skipped with an info diagnostic
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

`import_song` returns `detectedFormat`, `confidence`, canonical `song2htmlSource`, and diagnostics; `include: ['ast', 'mapping', 'candidates']` adds the Song AST, the source-line mapping, and ranked format candidates (always present when no format could be chosen). `validate_song`, `preview_song`, and `render_html` share the same parser. See [`tools.json`](tools.json).

Identical progressions share one chord definition; sections of the same kind with different progressions get numbered definitions (`verse`, `verse2`). Literal `^` in imported lyrics becomes `ˆ` so it cannot be mistaken for a chord marker.

## Compatibility boundary

The default `songToHtml()` function and its return shape are preserved; `song` gained `capo`, and errata gained `code` (and `location` where known). HTML output is unchanged except that chord-summary repeat groups render as `<span class="s2h-repeat">` instead of chord chips containing parentheses, and Nashville chords with explicit qualities are no longer doubled (`6m` is `Am`, not `Amm`).
