---
name: convert-chord-chart
description: "Convert a standard chord chart (chords-over-lyrics text) into song2html format. Use when the user provides a chord chart, lyrics with chords above them, or asks to convert a song into song2html format."
---

# Convert Chord Chart to song2html

This skill teaches you how to convert a standard "chords-over-lyrics" text file into the song2html plain-text format.

## Deterministic-first rule

Call `song2html:detect_format`, then `song2html:import_song`, before manually rewriting a chart. ChordPro, inline bracket chords, OpenSong XML, chords-over-lyrics, and existing song2html source have deterministic importers. Preserve their chord sequence, placement mapping, provenance, and diagnostics. Use model judgment only to propose explicit, unapplied corrections for unsupported or ambiguous input; never silently simplify or invent musical data.

## Standard Chord Chart Input (typical formats)

Standard chord charts look like one of these:

### Format A — Chords above lyrics (most common)
```
Amazing Grace
Key: G  Tempo: 72  Time: 3/4
Author: John Newton

[Verse 1]
G            C        G
Amazing grace, how sweet the sound
G            C        G    D
That saved a wretch like me

[Chorus]
C        G        D        G
I once was lost, but now am found
G        C        G
Was blind, but now I see
```

### Format B — Chords inline in brackets
```
Amazing Grace (G)

[Verse]
[G]Amazing [C]grace, how [G]sweet the sound
[G]That saved a [C]wretch like [G]me [D]

[Chorus]
[C]I once was [G]lost, but [D]now am [G]found
```

### Format C — Nashville Number charts
```
Amazing Grace - Key of G

Verse: 1 4 1 5
Chorus: 4 1 5 1

V1: Amazing grace how sweet the sound / That saved a wretch like me
Ch: I once was lost but now am found / Was blind but now I see
```

### Format D — Tab/chord sites (Ultimate Guitar, etc.)
```
[Intro] G

[Verse 1]
G            C    G
Amazing grace how sweet the sound
G            C        G  D
That saved a wretch like me
```

## Step-by-step Conversion Process

### Step 1: Extract the title and key

Look for the song title and musical key. The key may appear:
- In parentheses after the title: `Song Name (G)`
- On a "Key:" line
- In brackets: `[Key: G]`
- Implied by the first chord

Write the title line:
```
Amazing Grace [G]
```

### Step 2: Extract metadata

Gather author, tempo, time signature from the header area. Write as 2-space indented lines:
```
  author: John Newton
  tempo: 72
  time: 3/4
```

### Step 3: Extract chord progressions per section

For each section (verse, chorus, bridge, etc.), preserve the chord sequence **exactly in order of appearance**. Do not deduplicate or infer shared progressions unless the user explicitly approves that edit.

From chords-over-lyrics like:
```
G            C        G
Amazing grace, how sweet the sound
G            C        G    D
That saved a wretch like me
```

The observed chord progression is: `G C G G C G D`. Preserve that sequence. A possible shorter repeating pattern may be offered separately as a suggestion, but must not replace observed events automatically.

Write as 2-space indented definitions:
```
  verse: G C G G C G D
  chorus: C G D G
```

**Important rules:**
- Section names are lowercase in chord definitions: `verse`, `chorus`, `bridge`
- Share definitions or compress repetition only when the source explicitly does so or the user approves the change

### Step 4: Write lyric sections with caret markers

This is the critical step. For each lyric section, place a `^` caret at the **exact syllable** where each chord change occurs.

Given chords-over-lyrics:
```
G            C        G         D
Amazing grace, how sweet the sound
```

The chords align to specific syllables:
- `G` → "Amazing" (start of line)
- `C` → "grace" (the comma area)
- `G` → "sweet"
- `D` → "sound"

Convert to:
```
    ^Amazing ^grace, how ^sweet the ^sound
```

**Caret placement rules:**
- Each `^` consumes the next chord from the section's chord progression
- Place `^` directly before the syllable/word where the chord sounds
- The `^` replaces the chord name — don't include the chord name in the lyrics
- Count your carets — they should match the number of chords in the progression (or the chords will cycle)
- If a chord sounds on empty space (no lyric), you can write `^ ` (caret then space)

Write under the `Sections:` header with 2-space indented names and 4-space indented lyrics:
```
Sections:
  Verse 1:
    ^Amazing ^grace, how ^sweet the ^sound
    ^That saved a ^wretch like ^me

  Chorus:
    ^I once was ^lost, but ^now am ^found
    ^Was blind, but ^now I ^see
```

### Step 5: Add arrangements (optional)

If the chart specifies a song structure (e.g., V1 → C → V2 → C → Bridge → C), add:
```
Arrangements:
  Full:
    Verse 1
    Chorus
    Verse 2
    Chorus
    Bridge
    Chorus
```

## Complete Conversion Example

### Input (standard chord chart):
```
How Great Thou Art
Key: Bb  Time: 4/4  Tempo: 76
Writer: Carl Boberg

[Verse 1]
Bb           Eb          Bb
O Lord my God, when I in awesome wonder
Bb           F           Bb
Consider all the worlds Thy hands have made

[Verse 2]
Bb           Eb          Bb
I see the stars, I hear the rolling thunder
Bb           F           Bb
Thy power throughout the universe displayed

[Chorus]
Eb           Bb          F          Bb
Then sings my soul, my Savior God to Thee
Eb           Bb          F          Bb
How great Thou art, how great Thou art

Structure: V1, V2, Chorus, V1, V2, Chorus, Chorus
```

### Output (song2html format):
```
How Great Thou Art [Bb]
  author: Carl Boberg
  tempo: 76
  time: 4/4

  verse: Bb Eb Bb Bb F Bb
  chorus: Eb Bb F Bb Eb Bb F Bb

Sections:
  Verse 1:
    ^O Lord my ^God, when I in ^awesome wonder
    ^Consider ^all the worlds Thy ^hands have made

  Verse 2:
    ^I see the ^stars, I hear the ^rolling thunder
    ^Thy power ^throughout the ^universe displayed

  Chorus:
    ^Then sings my ^soul, my Savior ^God to ^Thee
    ^How great Thou ^art, how great Thou ^art

Arrangements:
  Full:
    Verse 1
    Verse 2
    Chorus
    Verse 1
    Verse 2
    Chorus
    Chorus
```

## Handling Tricky Cases

### Chords that fall between words
If a chord sounds between two words, attach the caret to the word that follows:
```
Input:   Am        G    C
         She walks in beauty
Output:  ^She walks ^in ^beauty
```

### Chords on the same word (quick changes)
If two chords happen rapidly on one word, split it or attach to the nearest syllable:
```
Input:   G  C
         Amazing
Output:  ^Ama^zing
```

### Lines with no chords
If a lyric line has no chords above it, write it without any carets:
```
    This line has no chord changes
```

### Instrumental sections
If a section has chords but no lyrics, you can either omit it or create empty caret lines:
```
  Intro:
    ^ ^ ^ ^
```

### Nashville Number conversion
If the original uses Nashville numbers, keep them — song2html supports them natively:
```
  verse: 1 4 5 1
  chorus: 4 5 6m 1
```

### Different chords per verse
If Verse 1 and Verse 2 genuinely have different chord progressions (rare), define separate chord sections:
```
  verse-1: G C D G
  verse-2: Am C D G
```
Then name your lyric sections to match: `Verse-1 1:` and `Verse-2 1:`.

## Workflow

1. Read the input chord chart
2. Identify title, key, metadata
3. Identify all sections and their chord progressions
4. For each section, align carets to where chords fall on lyrics
5. Optionally define arrangements
6. Use `song2html:validate_song` to check for errors
7. Use `song2html:write_song_file` to save the result
8. Optionally use `song2html:render_html` to preview as HTML
