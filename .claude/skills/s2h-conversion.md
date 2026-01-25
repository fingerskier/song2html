# S2H Song Conversion Skill

Convert song files (lyrics with chords) into the S2H (Song2Html) format for rendering as HTML chord charts.

## When to Use This Skill

Use this skill when the user:
- Wants to convert a song or chord chart to S2H format
- Has lyrics with chords and needs them formatted for song2html
- Asks to create a new song file in the project's format
- Needs help fixing or improving an S2H file

## S2H Format Quick Reference

### Structure Overview

```
Title [Key]
  metadata (2-space indent)
  chord definitions (2-space indent)

Sections:
  Section Name:
    lyrics with ^chord markers (4-space indent)

Arrangements:
  Arrangement Name:
    Section Name
```

### 1. Title Line

First line contains the song title with optional key in brackets:
```
Song Title [G]
```

Key formats: `[C]`, `[F#]`, `[Bb]`, `[Am]`, `[F#m]`, `[Bbm]`

### 2. Metadata (2-space indentation)

```
  author: Artist Name
  key: G
  tempo: 120
  time: 4/4
```

### 3. Chord Definitions (2-space indentation)

Define chord progressions for each section type:
```
  verse: G C D G
  chorus: C D Em G
  bridge: Am D G
```

**Chord notation types:**
- Standard: `C`, `Dm`, `Em7`, `Fmaj7`, `G7`
- Slash chords (bass): `C/G`, `Am/E`
- Treble chords: `F\A`, `G\B`
- Nashville numbers: `1 4 5 1` (auto-transposed to key)
- Repetition: `(G C) x2 D G` expands to `G C G C D G`
- Chord melody: `G-BCD` or `1-123`

### 4. Sections (4-space indentation for lyrics)

```
Sections:
  Verse 1:
    ^Amazing ^grace, how ^sweet the ^sound
    ^That saved a ^wretch like ^me

  Chorus:
    ^I once was ^lost, but ^now am ^found
```

**Chord markers (`^`):**
- Place `^` immediately before the syllable where a chord change occurs
- Each `^` inserts the next chord from the section's progression
- Progression cycles if more carets than chords

### 5. Arrangements (optional)

```
Arrangements:
  Short:
    Verse 1
    Chorus

  Full:
    Verse 1
    Chorus
    Verse 2
    Chorus
    Bridge
    Chorus
```

## Conversion Process

When converting a song to S2H format:

1. **Extract the title and key** from the source
2. **Identify metadata**: author, tempo, time signature
3. **Group chord progressions by section type** (verse, chorus, bridge, etc.)
4. **Map sections**: Verse 1, Verse 2 share `verse:` chords; Chorus uses `chorus:` chords
5. **Place chord markers** (`^`) at each chord change position in lyrics
6. **Create arrangements** if specific orderings are needed

## Example Conversion

### Input (typical chord chart format)

```
Amazing Grace - John Newton
Key: G, Tempo: 72 BPM, 3/4 time

[Verse 1]
G        C       G           D
Amazing grace, how sweet the sound
G        C         G
That saved a wretch like me

[Chorus]
C        G         D        G
I once was lost, but now am found
```

### Output (S2H format)

```
Amazing Grace [G]
  author: John Newton
  tempo: 72
  time: 3/4

  verse: G C G D
  chorus: C G D G

Sections:
  Verse 1:
    ^Amazing ^grace, how ^sweet the ^sound
    ^That saved a ^wretch like ^me

  Chorus:
    ^I once was ^lost, but ^now am ^found
```

## Common Patterns

### Multiple verses with same chords
```
  verse: G C D G

Sections:
  Verse 1:
    ^First verse ^lyrics ^here

  Verse 2:
    ^Second verse ^lyrics ^here
```

### Pre-chorus and bridge
```
  verse: G D Em C
  prechorus: Am D
  chorus: C G D G
  bridge: Em C G D

Sections:
  Verse 1:
    ^Lyrics...

  Pre-Chorus:
    ^Building ^up...

  Chorus:
    ^Main hook...

  Bridge:
    ^Contrasting ^section...
```

### Nashville Number System (for easy transposition)
```
My Song [G]
  verse: 1 4 5 1
  chorus: 4 5 6m 1
```
Numbers auto-transpose based on key: in G, `1 4 5` becomes `G C D`.

## Testing Converted Files

After creating an S2H file, test it with:
```bash
node -e "import('./index.js').then(m => console.log(m.default(require('fs').readFileSync('your-file.txt', 'utf8'))))"
```

Or run the test suite:
```bash
npm test
```

## File Location

Save new song files to `test/fixtures/` for testing, or wherever the user specifies.

## Common Issues to Avoid

1. **Wrong indentation**: Metadata/chords use 2 spaces; lyrics use 4 spaces
2. **Missing section colon**: Section names must end with `:` (e.g., `Verse 1:`)
3. **Mismatched section names**: `Verse 1` in lyrics must have a `verse:` chord definition
4. **Missing key**: Key is needed for Nashville number transposition
5. **Unbalanced carets**: Ensure chord markers align with the defined progression
