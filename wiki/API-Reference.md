# API Reference

## songToHtml(source, arrangementName?)

Converts a song source file into HTML markup with chord notation and lyrics.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | string | (required) | The raw song source text containing metadata, chords, lyrics, and arrangements |
| `arrangementName` | string | `''` | Optional name of the arrangement to use. Defaults to the first available arrangement |

### Return Value

Returns an object with the following properties:

```typescript
{
  html: string;          // The generated HTML markup
  arrangements: string[]; // Array of available arrangement names
  song: {
    key: string | null;   // Song key (e.g., "C", "F#", "Am")
    tempo: number | null; // Tempo in BPM
    time: string | null;  // Time signature (e.g., "4/4", "3/4")
    authors: string[];    // Array of author names
  }
}
```

### Example

```javascript
import songToHtml from 'song2html';

const source = `My Song [G]
  author: Jane Doe
  tempo: 120

  verse: G C D G

Sections:
  Verse:
    ^Hello ^world

Arrangements:
  Full:
    Verse
`;

const result = songToHtml(source, 'Full');

console.log(result.html);
// <article class="s2h-song">...</article>

console.log(result.arrangements);
// ['Full']

console.log(result.song);
// { key: 'G', tempo: 120, time: null, authors: ['Jane Doe'] }
```

## Chord Translation

The library automatically translates Nashville Number notation to standard chord names based on the song key.

### Nashville Numbers to Chords

| Number | Major Key | Quality |
|--------|-----------|---------|
| 1 | Root | Major |
| 2 | 2nd | Minor |
| 3 | 3rd | Minor |
| 4 | 4th | Major |
| 5 | 5th | Major |
| 6 | 6th | Minor |
| 7 | 7th | Diminished |

### Examples in Key of C

| Input | Output |
|-------|--------|
| `1` | C |
| `2` | Dm |
| `4` | F |
| `5` | G |
| `1/5` | C/G |

## Chord Notation Features

### Slash Chords (Bass Note)

Specify a bass note using `/`:

```
F/A    → F with A in bass
1/5    → Root chord with 5th in bass
4/3    → 4th chord with 3rd of that chord in bass
```

### Treble Chords

Specify a treble note using `\`:

```
F\D    → F with D on top
4\3    → 4th chord with 3rd as treble
```

### Chord Melody

Add melody notes after a dash:

```
G-BCD  → G chord with B, C, D melody
G-671  → G chord with melody notes (Nashville numbers)
```

### Position Indicators

Add fret position/octave with `|`:

```
G|5    → G chord at 5th position
C|3    → C chord at 3rd position
```

### Chord Modifiers

Standard modifiers are preserved:

```
1sus   → Csus (in key of C)
5+     → G+ (augmented)
67     → Am7 (6th chord with 7th)
```

## Repeat Notation

Use parentheses and `xN` to repeat chord groups:

```
(C G Am F)x2
```

Expands to: `C G Am F C G Am F`

## Flat Key Handling

The library automatically uses flats in flat keys:

| Key | 5 chord |
|-----|---------|
| C | G |
| F | C |
| Bb | F |
| Eb | Bb |

## Page Budget

The output is paginated with approximately 28 "weight units" per page:

| Element | Weight |
|---------|--------|
| Metadata line | 1 |
| Chords heading | 2 |
| Chord paragraph | 2 |
| Section heading | 2 |
| Lyric line | 1 |

This ensures consistent page breaks for printing.
