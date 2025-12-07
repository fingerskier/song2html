# Styling Guide

song2html generates semantic HTML with consistent class names, making it easy to style with CSS.

## CSS Class Reference

All classes use the `s2h-` prefix to avoid conflicts with your existing styles.

### Container Classes

| Class | Element | Description |
|-------|---------|-------------|
| `s2h-song` | `<article>` | Root container for the entire song |
| `s2h-page` | `<section>` | Page container (has `data-page` attribute) |
| `s2h-meta` | `<section>` | Metadata section (key, tempo, etc.) |
| `s2h-chords` | `<section>` | Chord chart section |
| `s2h-section` | `<section>` | Song section (verse, chorus, etc.) |

### Metadata Classes

| Class | Element | Description |
|-------|---------|-------------|
| `s2h-meta-key` | `<p>` | Key information |
| `s2h-meta-tempo` | `<p>` | Tempo (BPM) |
| `s2h-meta-time` | `<p>` | Time signature |
| `s2h-meta-authors` | `<p>` | Author(s) |

### Content Classes

| Class | Element | Description |
|-------|---------|-------------|
| `s2h-chords-title` | `<h3>` | "Chords" heading |
| `s2h-chord-line` | `<p>` | Line of chords in chord chart |
| `s2h-chord-section-label` | `<span>` | Section name in chord chart |
| `s2h-chord` | `<span>` or `<sup>` | Individual chord |
| `s2h-section-title` | `<h3>` | Section heading (e.g., "Verse 1") |
| `s2h-lyric-line` | `<p>` | Line of lyrics |
| `s2h-line-break` | `<br>` | Line break in chord charts |

### Dynamic Section Classes

Each section also gets a dynamic class based on its name:
- `s2h-section-verse-1` for "Verse 1"
- `s2h-section-chorus` for "Chorus"
- `s2h-section-bridge` for "Bridge"

## Example Stylesheet

```css
/* Base container */
.s2h-song {
  font-family: Georgia, 'Times New Roman', serif;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

/* Pages for printing */
.s2h-page {
  page-break-after: always;
  margin-bottom: 2rem;
}

.s2h-page:last-child {
  page-break-after: avoid;
}

/* Metadata section */
.s2h-meta {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
}

.s2h-meta p {
  margin: 0.25rem 0;
}

/* Chord chart */
.s2h-chords {
  background: #fff3e0;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
}

.s2h-chords-title {
  margin-top: 0;
  color: #e65100;
}

.s2h-chord-line {
  margin: 0.5rem 0;
}

.s2h-chord-section-label {
  font-weight: bold;
  color: #bf360c;
  margin-right: 0.5rem;
}

/* Individual chords */
.s2h-chord {
  font-weight: bold;
  color: #1565c0;
}

/* Chords above lyrics */
sup.s2h-chord {
  font-size: 0.75em;
  vertical-align: super;
  margin-right: 2px;
}

/* Song sections */
.s2h-section {
  margin-bottom: 1.5rem;
}

.s2h-section-title {
  color: #333;
  border-bottom: 2px solid #1565c0;
  padding-bottom: 0.25rem;
}

/* Lyrics */
.s2h-lyric-line {
  line-height: 2;
  margin: 0.25rem 0;
}

/* Specific section styling */
.s2h-section-chorus {
  background: #e3f2fd;
  padding: 1rem;
  border-radius: 4px;
}

.s2h-section-bridge {
  font-style: italic;
}
```

## Print Styles

```css
@media print {
  .s2h-song {
    font-size: 12pt;
  }

  .s2h-page {
    page-break-after: always;
  }

  .s2h-meta, .s2h-chords, .s2h-section-chorus {
    background: none !important;
    border: 1px solid #ccc;
  }
}
```

## Dark Mode

```css
@media (prefers-color-scheme: dark) {
  .s2h-song {
    background: #1a1a1a;
    color: #e0e0e0;
  }

  .s2h-meta {
    background: #2d2d2d;
  }

  .s2h-chords {
    background: #3d2814;
  }

  .s2h-chord {
    color: #64b5f6;
  }

  .s2h-section-title {
    color: #fff;
    border-color: #64b5f6;
  }
}
```

## Tips

1. **Chord positioning**: Use `position: relative` on lyrics and `position: absolute` on chords for precise positioning
2. **Responsive design**: Consider hiding chord charts on mobile and showing inline chords only
3. **Font choice**: Monospace fonts work well for chord alignment
4. **Page breaks**: Use `page-break-inside: avoid` on sections to prevent awkward splits
