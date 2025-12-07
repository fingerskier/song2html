# Troubleshooting

Common issues and their solutions when using song2html.

## Parsing Issues

### Chords Not Appearing

**Problem**: Chords don't show up in the lyrics.

**Solutions**:
1. Make sure you're using caret (`^`) markers in your lyrics to indicate chord positions
2. Verify the section name matches a chord definition (first word must match)
3. Check that chord definitions are properly indented under the title

```
// Wrong - no caret markers
  Verse:
    Missing chords here

// Correct
  Verse:
    ^Chords will ^appear here
```

### Sections Not Rendering

**Problem**: Sections are missing from the output.

**Solutions**:
1. Ensure `Sections:` header is present and properly capitalized (case-insensitive but must be spelled correctly)
2. Check indentation - section names need 2-space indent, content needs 4-space indent
3. Verify section names end with a colon

```
Sections:
  Verse 1:                    ← 2-space indent, ends with colon
    ^Lyrics here              ← 4-space indent
```

### Arrangements Not Working

**Problem**: Selected arrangement isn't used or sections appear in wrong order.

**Solutions**:
1. Verify `Arrangements:` header is present
2. Check that arrangement names match exactly (including spaces)
3. Ensure section names in the arrangement match defined sections exactly

```
Arrangements:
  Live:                       ← Arrangement name with colon
    Verse 1                   ← Exact section name (no colon)
    Chorus
```

## Chord Translation Issues

### Nashville Numbers Not Converting

**Problem**: Numbers stay as numbers instead of converting to chord names.

**Solutions**:
1. Specify a key in the title or metadata:
   ```
   Song Title [C]
   ```
   or
   ```
     key: C
   ```
2. Ensure key is a valid note (A-G with optional #, b, or m)

### Wrong Chord Quality

**Problem**: Minor/major quality is incorrect.

**Explanation**: Nashville number qualities follow the major scale pattern:
- 1, 4, 5 → Major
- 2, 3, 6 → Minor
- 7 → Diminished

If you need a different quality, use explicit chord names or modifiers:
```
  verse: 1 2m 3m 4    ← Explicit minor markers
```

### Sharps When Expecting Flats

**Problem**: Output shows `F#` when you expect `Gb`.

**Solution**: Use a flat key name:
```
  key: Gb   ← Will prefer flats
  key: F#   ← Will prefer sharps
```

## Output Issues

### HTML Not Rendering Correctly

**Problem**: Raw HTML shows instead of formatted content.

**Solutions**:
1. Ensure you're inserting the HTML into the page with `innerHTML` or similar
2. Check that the HTML isn't being escaped by your templating system
3. Verify the stylesheet is loaded for proper styling

### Page Breaks in Wrong Places

**Problem**: Content splits awkwardly between pages.

**Explanation**: The library uses a weight-based pagination system (~28 units per page). You cannot directly control page breaks, but you can:
1. Reorder sections in your arrangement
2. Add/remove content to shift break points
3. Use CSS print styles to control page breaks:
   ```css
   @media print {
     .s2h-section {
       page-break-inside: avoid;
     }
   }
   ```

### Special Characters Appearing Wrong

**Problem**: Characters like `'`, `"`, `&` display incorrectly.

**Solution**: The library automatically escapes HTML entities. If you're seeing issues:
1. Check your source file encoding is UTF-8
2. Ensure your HTML page has proper charset meta tag:
   ```html
   <meta charset="UTF-8">
   ```

## Common Mistakes

### Mixing Tabs and Spaces

**Problem**: Inconsistent parsing behavior.

**Solution**: Use spaces only (2-space for metadata/section headers, 4-space for content).

### Missing Colons

**Problem**: Sections or metadata not recognized.

**Solutions**:
- Metadata needs colons: `key: C`
- Section names need colons: `Verse 1:`
- Arrangement names need colons: `Live:`

### Windows Line Endings

**Problem**: Extra blank lines or parsing issues on Windows.

**Solution**: The library handles both `\r\n` (Windows) and `\n` (Unix) line endings automatically. If issues persist, convert your file to Unix line endings.

## Getting Help

If your issue isn't covered here:

1. Check the [README specification](../README.md) for format details
2. Look at the [Examples](Examples) page for working samples
3. Open an issue on [GitHub](https://github.com/fingerskier/song2html/issues)

When reporting issues, include:
- Your song source file (or a minimal example)
- Expected output
- Actual output
- Node.js version
