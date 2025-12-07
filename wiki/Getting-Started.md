# Getting Started

This guide will help you get up and running with song2html quickly.

## Installation

### npm

```bash
npm install song2html
```

### From Source

```bash
git clone https://github.com/fingerskier/song2html.git
cd song2html
```

## Basic Usage

### ES Modules (Recommended)

```javascript
import songToHtml from 'song2html';

const songSource = `Amazing Grace [C]
  author: John Newton
  tempo: 72
  time: 3/4

  verse: C F C G
  chorus: F C G C

Sections:
  Verse 1:
    ^Amazing ^grace, how ^sweet the ^sound
    ^That saved a ^wretch like ^me

  Chorus:
    ^I once was ^lost, but ^now am ^found
    ^Was blind, but ^now I ^see
`;

const result = songToHtml(songSource);
console.log(result.html);
```

### With a Specific Arrangement

```javascript
const result = songToHtml(songSource, 'Live');
console.log(result.html);
console.log(result.arrangements); // ['Live', 'Studio', ...]
```

## Understanding the Output

The `songToHtml` function returns an object with three properties:

| Property | Type | Description |
|----------|------|-------------|
| `html` | string | The generated HTML markup |
| `arrangements` | string[] | List of available arrangement names |
| `song` | object | Metadata about the song |

### Song Metadata Object

```javascript
{
  key: 'C',           // Song key (null if not specified)
  tempo: 72,          // BPM (null if not specified)
  time: '3/4',        // Time signature (null if not specified)
  authors: ['John Newton']  // Array of authors
}
```

## File Structure

A song file has four main parts:

1. **Title Line** - The song title, optionally with key in brackets
2. **Metadata** - Key, tempo, time signature, authors, and chord charts
3. **Sections** - Lyrics with chord markers (^)
4. **Arrangements** - Optional ordering of sections

```
Title [Key]
  author: Name
  key: C
  tempo: 120
  time: 4/4

  verse: C G Am F
  chorus: F C G

Sections:
  Verse 1:
    ^Lyrics with ^chord markers

Arrangements:
  Live:
    Verse 1
    Chorus
```

## Next Steps

- See the [API Reference](API-Reference) for complete function documentation
- Check out [Examples](Examples) for more song formats
- Read the [Styling Guide](Styling-Guide) to customize the output appearance
