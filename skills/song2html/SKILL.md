---
name: song2html
description: "Read, write, parse, validate, transpose, and render song chord charts in the song2html format — a plain-text notation for chord charts with lyrics, Nashville numbers, and arrangements."
---

# song2html — Chord Chart Plugin

Create, edit, and convert song chord charts using the **song2html** plain-text format.

## Format Quick Reference

```
Song Title [Key]
  author: Songwriter Name
  tempo: 120
  time: 4/4

  verse: G C D G
  chorus: C D Em G

Sections:
  Verse 1:
    ^Lyrics with ^caret markers for ^chord ^placement

  Chorus:
    ^Chorus ^lyrics ^with ^chords

Arrangements:
  Full:
    Verse 1
    Chorus
```

### Key Syntax Rules

- **Title line**: first line, optional key in brackets `[G]`, `[F#m]`, `[Bb]`
- **Metadata**: 2-space indented — `author:`, `key:`, `tempo:`, `time:`
- **Chord definitions**: 2-space indented — `section-name: chord1 chord2 ...`
- **Sections header**: `Sections:` followed by named sections with 4-space indented lyrics
- **Caret `^`**: marks where the next chord is placed above lyrics
- **Nashville numbers**: `1`–`7` auto-transpose based on key
- **Slash chords**: `C/G` (bass), `F\A` (treble)
- **Repetition**: `(G C) x2` expands to `G C G C`
- **Transpose directive**: `<transpose +2>` shifts Nashville numbers
- **Arrangements**: optional named orderings of sections

## Converting Standard Chord Charts

To convert a standard chords-over-lyrics text file into song2html format, see the **convert-chord-chart** skill for a detailed step-by-step guide covering all common input formats (chords above lyrics, inline brackets, Nashville numbers, tab sites).

**Quick conversion summary:**
1. Extract title + key → first line: `Song Title [Key]`
2. Extract metadata → 2-space indented `author:`, `tempo:`, `time:`
3. Extract chord progressions per section → 2-space indented `section: chord1 chord2 ...`
4. Place `^` carets at each syllable where a chord change occurs in the lyrics
5. Wrap in `Sections:` with 2-space section headers and 4-space indented lyrics
6. Optionally add `Arrangements:` for song structure

## Tools

| Tool | Purpose |
|------|---------|
| `song2html:parse_song` | Parse source text → metadata, HTML, arrangements, errata |
| `song2html:validate_song` | Check source text for errors without full rendering |
| `song2html:create_song` | Build source text from structured input (title, chords, sections) |
| `song2html:read_song_file` | Read a song file from disk and parse it |
| `song2html:write_song_file` | Write source text to a file (validates first) |
| `song2html:list_song_files` | Scan a directory for song files and summarize each |
| `song2html:transpose_song` | Transpose named chords by N half steps |
| `song2html:render_html` | Generate a standalone HTML page with embedded styles |
