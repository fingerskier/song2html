---
name: song2html
description: "Write, edit, validate, import, transpose, and render song chord charts in the song2html text format (chords as ^ markers over lyrics, Nashville numbers, arrangements, capo). Use when the user wants a chord chart or lead sheet created, fixed, converted from ChordPro/OpenSong/chords-over-lyrics, transposed, or rendered to HTML."
---

# song2html

song2html is a plain-text chord chart format and a `song2html` command-line tool that checks, converts, and renders it. Write the text yourself; use the CLI to check it, import other formats, and render.

## Getting the CLI

Run `command -v song2html`. If nothing is found, use `npx -y song2html` (Node.js 20+) everywhere this skill says `song2html`. Native binaries that need no runtime are attached to https://github.com/fingerskier/song2html/releases.

If the host exposes song2html MCP tools instead of a shell, see the table at the end.

## Format

```
Amazing Grace [G]
  author: John Newton
  tempo: 72
  time: 3/4
  capo: 0

  verse: G C G D
    G C G D G
  chorus: (C G) x2 D G

Sections:
  Verse 1:
    A^mazing ^grace, how ^sweet the ^sound
    That ^saved a ^wretch like ^me ^ ^

  Chorus:
    ^I once was ^lost, but ^now am ^found

  Verse 2:
    <chords verse>
    <transpose +2>
    ^'Twas grace that ^taught my ^heart to ^fear

Arrangements:
  Full:
    Verse 1
    Chorus
    Verse 2 <transpose +2>
    Chorus
```

- **Line 1:** the title, with an optional key in brackets: `[G]`, `[F#m]`, `[Bb]`.
- **Metadata** (2-space indent): `author` (comma-separated), `key`, `tempo` (integer, `bpm` allowed), `time`, `capo` (0-11), `owner`, `license`.
- **Chord definitions** (2-space indent): `name: chords…`.
  - Continuation lines are indented deeper.
  - `(C G) x2` repeats a group (x1–x128).
- **Sections:** `Sections:`, then `  Name:` headers at 2 spaces and lyric lines at 4 spaces.
  - A section uses the definition named by the first word of its name (`Verse 2` → `verse`).
  - `<chords NAME>` picks another definition; `<chords none>` uses none.
- **Carets:** each `^` takes the next chord of the section's progression. The count carries across lines and cycles if there are more carets than chords.
  - Put `^` directly before the syllable where the chord sounds.
  - A `^` followed by a space is a chord on a beat with no lyric.
- **Transpose:** `<transpose ±N>` in a section, or after an arrangement entry, shifts the key for Nashville numbers only. An arrangement-level value replaces the section's; it doesn't add to it.
- **Arrangements** (optional): `Arrangements:`, then named lists of section names. The first one is the default. Without any, sections play in written order.
- **Indentation:** a line indented deeper than its section header is always a lyric, even if it ends in `:`.
- **Reserved names:** `__proto__`, `constructor`, `toString`, `valueOf` and similar can't be used as names; they are ignored with a warning.

### Chords

| Form | Examples | Notes |
|------|----------|-------|
| Named | `G` `Em7` `Bbmaj7` `C7sus4` `Cmadd9` `C6/9` `C°` `Cø7` `CΔ7` `C+` `Am7(b5)` `E7#9` | Uppercase root |
| Nashville | `1` `4` `6m` `2m7` `4maj7` `5sus4` `b7` `#4dim` | Resolved in the key (major, or natural minor for `m` keys) |
| Bass | `G/B` `1/3` `5/2` | Nashville bass is a scale degree |
| Treble | `F\A` `F\3` `4\3` | Numbers are intervals above the chord root |
| Melody | `G-BCD` `1-123` | Numbers are scale degrees |
| Position | `G\|5` | Fret or octave |
| No chord | `N.C.` | |

Nashville qualities:
- A bare number gets its diatonic triad: in G, `1 2 3 4 5 6 7` → `G Am Bm C D Em F#dim`.
- An explicit triad quality replaces it (`6m`, `4sus`, `2maj7`).
- Extensions stack on it (`27` → `Am7`, `77` → `F#m7b5`).
- A `b`/`#` prefix alters the degree and defaults to major (`b7` in G → `F`).

## Workflow

1. **Write or edit** the `.s2h` text.
2. **Check:** `song2html --check --diagnostics json song.s2h`
   - Fix every `error`; read the warnings.
   - Exit codes: 0 means no errors, 1 means errors, 2 means bad arguments or a missing file.
3. **Preview caret placement:** `song2html -t preview song.s2h` prints `A[G]mazing [C]grace` per section, with chords as written. Compare it against the source chart.
4. **Render** when asked:
   - Page: `song2html song.s2h -o song.html` (`--theme print|stage|compact|large-type|dark`, `-a "Arrangement"`, `--capo N`).
   - Fragment: `-t fragment`.
   - Library folder: `song2html songs/*.s2h -d site/`.

Other outputs (`-t`): `json` (html, song, errata), `ast` (structured song), `song2html` (canonical text), `arrangements`.

### Common diagnostics

| Code | Fix |
|------|-----|
| `MISSING_SECTIONS` | Add the `Sections:` line |
| `MISSING_SECTION` | The arrangement names a section that doesn't exist; check spelling and case |
| `MISSING_CHORDS` | A section has `^` but no chord definition; add `type: chords…` or `<chords NAME>` |
| `CHORD_CARET_MISMATCH` | More carets than chords, so the chords cycle. Fine for repeated patterns; otherwise add chords or remove carets |
| `UNKNOWN_CHORD` | A token isn't a chord; fix the spelling |
| `INVALID_KEY` / `INVALID_TEMPO` / `INVALID_CAPO` | Fix the metadata value |
| `DUPLICATE_SECTION` | Two sections share a name; rename one (`Verse 2`) |
| `RESERVED_NAME` | Rename the section, definition, or arrangement |

## Converting other charts

Import deterministically first; hand-edit only what the importer could not decide.

```sh
song2html chart.txt -t song2html > song.s2h          # auto-detect
song2html chart.txt -f chords-over-lyrics -t song2html --key G --title "Song" > song.s2h
```

- **Supported formats:** ChordPro (`{title}`, `{start_of_verse}`, `[G]lyrics`, `{chorus}`), inline brackets, OpenSong XML, chords-over-lyrics (Ultimate Guitar style), and song2html.
- **Ambiguous format:** if detection fails with `AMBIGUOUS_FORMAT` or `UNKNOWN_FORMAT`, pass `-f`.
- **Imported chord order:** every observed chord is kept in order.
  - Identical progressions share a definition.
  - A section with a different progression gets `verse2` plus a `<chords verse2>` line.
- **Read these diagnostics, then run `-t preview`:**
  - `SNAP_TO_FOLLOWING_WORD` / `SNAP_TO_WORD_START`: a chord was moved onto a word.
  - `CHORD_BEYOND_LYRIC`: a chord was attached at the end of the line.
  - `INSTRUMENTAL_CHORD_LINE`: a chord-only line became `^ ^ ^`.
- Never invent, drop, or "simplify" chords. Propose musical corrections to the user rather than applying them silently.

To convert by hand (unsupported input, or a chart pasted as prose):
1. Write the title and key.
2. Add metadata.
3. Give each section type one definition listing its chords in order of appearance.
4. Add a `^` before each syllable where a chord lands.
5. Run `--check` and `-t preview`.

## Transpose and capo

```sh
song2html song.s2h --transpose -2 -t song2html > song-down2.s2h   # rewrites key and named chords
song2html song.s2h --capo 3 -o capo3.html                          # Bb song, G shapes
```

Transposition picks the conventional spelling for the new key (G +3 → Bb) and moves bass, treble, and melody notes. Nashville numbers follow the key automatically.

## MCP equivalents

If the host exposes song2html MCP tools instead of a shell:

| CLI | MCP tool |
|-----|----------|
| `--check` | `validate_song` |
| `-t preview` | `preview_song` |
| `-t song2html` on another format | `import_song` (after `detect_format`) |
| `--transpose N -t song2html` | `transpose_song` |
| `-o page.html` | `render_html` |
| `-t json` | `parse_song` |
