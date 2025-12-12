# Song2HTML File Specification

Barebones specification for AI systems to create and parse song2html text files.

## Input Format (.txt)

### Structure

```
<title> [<key>]
  <metadata>
  <chord-definitions>

Sections:
  <section-name>:
    <lyrics-with-chord-markers>
```

### Rules

1. **Line 1**: Song title, optionally followed by key in brackets: `My Song [Am]`
2. **Metadata**: 2-space indent, key-value pairs with colon
3. **Chord definitions**: 2-space indent, section-name followed by space-separated chords
4. **Sections marker**: Literal `Sections:` on its own line
5. **Section headers**: 2-space indent, name with trailing colon
6. **Lyrics**: 4-space indent, `^` marks chord positions

### Reserved Metadata Keys

- `author` - Comma-separated author names
- `key` - Musical key (if not in title)
- `tempo` - BPM (numeric)
- `time` - Time signature (e.g., `4/4`)

All other keys become chord definitions.

### Chord Notation

| Notation | Meaning | Example |
|----------|---------|---------|
| Letter | Standard chord | `C`, `Am`, `F#m` |
| Number | Nashville (1=root) | `1`, `4m`, `5` |
| `/` | Bass note | `C/G`, `1/5` |
| `(...)xN` | Repeat group N times | `(C G)x2` → `C G C G` |

### Minimal Example

```
Hello World [G]
  author: AI
  verse: G C D G

Sections:
  Verse 1:
    ^Hello ^world
    ^Goodbye ^moon
```

---

## Output Format (.html)

### Structure

```html
<article class="s2h-song">
  <section class="s2h-page" data-page="1">
    <section class="s2h-meta">...</section>
    <section class="s2h-chords">...</section>
    <section class="s2h-section">...</section>
  </section>
</article>
```

### CSS Classes

| Class | Element | Purpose |
|-------|---------|---------|
| `s2h-song` | `<article>` | Root container |
| `s2h-page` | `<section>` | Page wrapper (has `data-page`) |
| `s2h-meta` | `<section>` | Metadata container |
| `s2h-meta-title` | `<h2>` | Song title |
| `s2h-meta-key` | `<p>` | Key display |
| `s2h-meta-tempo` | `<p>` | Tempo display |
| `s2h-meta-time` | `<p>` | Time signature |
| `s2h-meta-authors` | `<p>` | Author(s) |
| `s2h-chords` | `<section>` | Chord summary |
| `s2h-chords-title` | `<h3>` | "Chords" heading |
| `s2h-chord-line` | `<p>` | One chord progression |
| `s2h-chord-section-label` | `<span>` | Section name label |
| `s2h-chord` | `<span>` or `<sup>` | Individual chord |
| `s2h-section` | `<section>` | Song section (has `id`) |
| `s2h-section-title` | `<h3>` | Section heading |
| `s2h-lyric-line` | `<p>` | Lyric line |

### Section IDs

- Slug format: lowercase, non-alphanumeric → hyphen
- Example: `Verse 1` → `id="verse-1"`
- Duplicates numbered: `id="verse-1"`, `id="verse-1-2"`

### Minimal Example

```html
<article class="s2h-song">
<section class="s2h-page" data-page="1">
<section class="s2h-meta">
<h2 class="s2h-meta-title">Hello World</h2>
<p class="s2h-meta-key"><strong>Key:</strong> G</p>
<p class="s2h-meta-authors"><strong>Author:</strong> AI</p>
</section>
<section class="s2h-chords"><h3 class="s2h-chords-title">Chords</h3>
<p class="s2h-chord-line"><span class="s2h-chord-section-label">Verse</span> <span class="s2h-chord">G</span> <span class="s2h-chord">C</span> <span class="s2h-chord">D</span> <span class="s2h-chord">G</span></p>
</section>
<section id="verse-1" class="s2h-section s2h-section-verse-1">
<h3 class="s2h-section-title">Verse 1</h3>
<p class="s2h-lyric-line"><sup class="s2h-chord">G</sup>Hello <sup class="s2h-chord">C</sup>world</p>
<p class="s2h-lyric-line"><sup class="s2h-chord">D</sup>Goodbye <sup class="s2h-chord">G</sup>moon</p>
</section>
</section>
</article>
```

---

## Parsing Notes

- HTML-escape all user content (`&`, `<`, `>`, `"`, `'`)
- Chords cycle if more `^` markers than defined chords
- Blank lines are ignored
- Section names match chord definitions case-insensitively (first word)
- Supports both Unix (`\n`) and Windows (`\r\n`) line endings
