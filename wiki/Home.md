# song2html

Welcome to the **song2html** wiki! This library converts plain-text song charts into structured HTML, making it easy to display and style musical content in web browsers.

## What is song2html?

song2html is a JavaScript library that parses a simple text-based format for song charts (chords + lyrics) and outputs semantic HTML. It supports:

- **Nashville Number System** - Write chords as numbers (1, 4, 5) that transpose automatically
- **Multiple arrangements** - Define different arrangements (Live, Studio, etc.) in one file
- **Chord charts** - Display chords separately from lyrics
- **Automatic pagination** - Output is split into pages for easy printing/display

## Quick Links

- [Getting Started](Getting-Started) - Installation and basic usage
- [Styling Guide](Styling-Guide) - CSS classes and styling tips
- [API Reference](API-Reference) - Programmatic API documentation
- [Examples](Examples) - Real-world song examples
- [Troubleshooting](Troubleshooting) - Common issues and solutions

## Why song2html?

### Plain Text Source Files
Song charts are stored as simple `.txt` files that are easy to read, edit, and version control. No proprietary formats or special software needed.

### Semantic HTML Output
The generated HTML uses meaningful class names (`s2h-chord`, `s2h-lyric-line`, etc.) that make styling straightforward and consistent.

### Nashville Number Support
Write chord progressions using the Nashville Number System and let the library handle transposition based on the song's key.

### Flexible Arrangements
Define multiple arrangements in a single source file and select which one to render at runtime.

## Contributing

This project is open source. Contributions are welcome! Check out the [GitHub repository](https://github.com/fingerskier/song2html) for more information.
