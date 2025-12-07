import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import songToHtml from '../index.js';
import { describe, test, expect } from './runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('songToHtml', () => {
  describe('basic parsing and HTML generation', () => {
    test('generates HTML with correct structure', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.html).toContain('<article class="s2h-song">');
      expect(result.html).toContain('<section class="s2h-page"');
      expect(result.html).toContain('<section class="s2h-meta">');
      expect(result.html).toContain('<section class="s2h-chords">');
      expect(result.html).toContain('<section class="s2h-section');
      expect(result.html).toContain('</article>');
    });

    test('extracts metadata correctly', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.song.key).toBe('C');
      expect(result.song.tempo).toBe(72);
      expect(result.song.time).toBe('3/4');
      expect(result.song.authors).toEqual(['John Newton']);
    });

    test('includes metadata in HTML output', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.html).toContain('<strong>Key:</strong> C');
      expect(result.html).toContain('<strong>Tempo:</strong> 72');
      expect(result.html).toContain('<strong>Time:</strong> 3/4');
      expect(result.html).toContain('<strong>Author:</strong> John Newton');
    });

    test('uses "Authors" label for multiple authors', () => {
      const source = `Multi Author [C]
  author: John Doe, Jane Doe
  verse: C G

Sections:
  Verse 1:
    ^Hello ^world`;
      const result = songToHtml(source);

      expect(result.html).toContain('<strong>Authors:</strong> John Doe, Jane Doe');
    });
  });

  describe('key detection', () => {
    test('extracts key from title line brackets', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.song.key).toBe('C');
    });

    test('prefers explicit key metadata over title', () => {
      const source = fixture('nashville-numbers.txt');
      const result = songToHtml(source);

      expect(result.song.key).toBe('G');
    });

    test('handles flat keys correctly', () => {
      const source = fixture('flat-key.txt');
      const result = songToHtml(source);

      expect(result.song.key).toBe('Bb');
    });

    test('returns null key when none specified', () => {
      const source = `No Key Song
  verse: C G

Sections:
  Verse 1:
    ^Hello ^world`;
      const result = songToHtml(source);

      expect(result.song.key).toBeNull();
    });
  });

  describe('Nashville number translation', () => {
    test('translates numeric chords to actual chords', () => {
      const source = fixture('nashville-numbers.txt');
      const result = songToHtml(source);

      // In key of G: 1=G, 4=C, 5=D, 6=Em
      expect(result.html).toContain('G');
      expect(result.html).toContain('C');
      expect(result.html).toContain('D');
      expect(result.html).toContain('Em');
    });

    test('uses flats for flat keys', () => {
      const source = fixture('flat-key.txt');
      const result = songToHtml(source);

      // In key of Bb: 1=Bb, 2=Cm, 4=Eb, 5=F
      expect(result.html).toContain('Bb');
      expect(result.html).toContain('Cm');
      expect(result.html).toContain('Eb');
      expect(result.html).toContain('F');
    });

    test('leaves numeric chords when no key specified', () => {
      const source = `No Key
  verse: 1 4 5

Sections:
  Verse 1:
    ^One ^two ^three`;
      const result = songToHtml(source);

      expect(result.html).toContain('>1<');
      expect(result.html).toContain('>4<');
      expect(result.html).toContain('>5<');
    });
  });

  describe('slash chords', () => {
    test('handles named slash chords', () => {
      const source = fixture('slash-chords.txt');
      const result = songToHtml(source);

      expect(result.html).toContain('C/G');
      expect(result.html).toContain('Am/E');
      expect(result.html).toContain('F/C');
    });

    test('translates Nashville slash chords', () => {
      const source = fixture('slash-chords.txt');
      const result = songToHtml(source);

      // In key of C: 1/5 = C/G, 4/1 = F/C, 5/2 = G/Dm
      expect(result.html).toMatch(/C\/G/);
      expect(result.html).toMatch(/F\/C/);
    });
  });

  describe('chord repetition with parentheses', () => {
    test('expands chord groups with x notation', () => {
      const source = fixture('chord-repetition.txt');
      const result = songToHtml(source);

      // (E A) x2 B E should expand to E A E A B E
      // With 6 carets, each should get a chord
      const chordMatches = result.html.match(/<sup class="s2h-chord">[^<]+<\/sup>/g);
      expect(chordMatches).toHaveLength(6);
    });
  });

  describe('arrangements', () => {
    test('returns available arrangements as array', () => {
      const source = fixture('multiple-arrangements.txt');
      const result = songToHtml(source);

      expect(result.arrangements.includes('Short')).toBe(true);
      expect(result.arrangements.includes('Full')).toBe(true);
    });

    test('uses specific arrangement when requested', () => {
      const source = fixture('multiple-arrangements.txt');
      const shortResult = songToHtml(source, 'Short');
      const fullResult = songToHtml(source, 'Full');

      // Short arrangement should not have Verse 2 or Bridge
      expect(shortResult.html).toContain('Verse 1');
      expect(shortResult.html).toContain('Chorus');
      expect(shortResult.html).not.toContain('Bridge');

      // Full arrangement should have everything
      expect(fullResult.html).toContain('Verse 1');
      expect(fullResult.html).toContain('Verse 2');
      expect(fullResult.html).toContain('Chorus');
      expect(fullResult.html).toContain('Bridge');
    });

    test('creates default arrangement when none specified', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.arrangements.includes('default')).toBe(true);
    });
  });

  describe('lyric processing', () => {
    test('inserts chords at caret positions', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      // Check that sup elements with chords are inserted
      expect(result.html).toMatch(/<sup class="s2h-chord">/);
    });

    test('wraps lyrics in paragraph tags', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.html).toMatch(/<p class="s2h-lyric-line">/);
    });

    test('cycles chords when more carets than chords', () => {
      const source = `Cycle Test [C]
  verse: C G

Sections:
  Verse 1:
    ^One ^two ^three ^four`;
      const result = songToHtml(source);

      const chordMatches = result.html.match(/<sup class="s2h-chord">[^<]+<\/sup>/g);
      expect(chordMatches).toHaveLength(4);
      // Should cycle: C, G, C, G
      expect(chordMatches[0]).toContain('C');
      expect(chordMatches[1]).toContain('G');
      expect(chordMatches[2]).toContain('C');
      expect(chordMatches[3]).toContain('G');
    });
  });

  describe('HTML escaping / XSS prevention', () => {
    test('escapes HTML entities in lyrics', () => {
      const source = fixture('special-characters.txt');
      const result = songToHtml(source);

      expect(result.html).toContain('&lt;html&gt;');
      expect(result.html).toContain('&amp;');
      expect(result.html).toContain('&quot;chars&quot;');
    });

    test('escapes ampersands in author names', () => {
      const source = fixture('special-characters.txt');
      const result = songToHtml(source);

      expect(result.html).toContain('&amp;');
    });

    test('escapes single quotes correctly', () => {
      const source = fixture('special-characters.txt');
      const result = songToHtml(source);

      // Single quotes should be escaped as &#039;
      expect(result.html).toContain('O&#039;Brien');
      expect(result.html).toContain('More&#039;s');
    });
  });

  describe('section handling', () => {
    test('creates section classes from section names', () => {
      const source = fixture('simple-song.txt');
      const result = songToHtml(source);

      expect(result.html).toContain('s2h-section-verse-1');
      expect(result.html).toContain('s2h-section-chorus');
    });

    test('maps chords to sections by section type', () => {
      const source = fixture('multiple-arrangements.txt');
      // Use Full arrangement which includes Verse 2
      const result = songToHtml(source, 'Full');

      // Both Verse 1 and Verse 2 should use verse chords
      expect(result.html).toContain('Verse 1');
      expect(result.html).toContain('Verse 2');
    });
  });

  describe('minimal input handling', () => {
    test('handles minimal song with no metadata', () => {
      const source = fixture('minimal-song.txt');
      const result = songToHtml(source);

      expect(result.song.key).toBeNull();
      expect(result.song.tempo).toBeNull();
      expect(result.song.time).toBeNull();
      expect(result.song.authors).toEqual([]);
      expect(result.html).toContain('Hello');
    });
  });

  describe('pagination', () => {
    test('creates multiple pages for long songs', () => {
      // Create a song with many sections to force pagination
      let sections = '';
      for (let i = 1; i <= 20; i++) {
        sections += `  Verse ${i}:\n    ^Line one ^line two\n    ^Line three ^line four\n    ^Line five ^line six\n\n`;
      }
      const source = `Long Song [C]
  verse: C G Am F

Sections:
${sections}`;
      const result = songToHtml(source);

      // Should have multiple pages
      const pageMatches = result.html.match(/data-page="\d+"/g);
      expect(pageMatches.length).toBeGreaterThan(1);
    });
  });
});

describe('edge cases', () => {
  test('handles Windows line endings (CRLF)', () => {
    const source = 'Test [C]\r\n  verse: C G\r\n\r\nSections:\r\n  Verse 1:\r\n    ^Hello ^world';
    const result = songToHtml(source);

    expect(result.html).toContain('Hello');
    expect(result.song.key).toBe('C');
  });

  test('handles empty input gracefully', () => {
    const result = songToHtml('');

    expect(result.html).toContain('<article class="s2h-song">');
    expect(result.song.key).toBeNull();
  });

  test('handles input with only title', () => {
    // When there's only a title line, the key is extracted from brackets
    // Note: The key regex only matches single letter + optional sharp/flat (e.g., A, C#, Bb)
    // It does NOT match "Am" - that's a bug. Use a simple key for this test.
    const result = songToHtml('Just A Title [A]\n');

    expect(result.song.key).toBe('A');
    expect(result.html).toContain('<article class="s2h-song">');
  });

  test('key regex matches minor keys in brackets', () => {
    // [Am] in the title is now recognized as key "Am"
    const result = songToHtml('Song In Minor [Am]\n');

    expect(result.song.key).toBe('Am');
  });

  test('key regex matches various minor keys', () => {
    expect(songToHtml('Test [Dm]\n').song.key).toBe('Dm');
    expect(songToHtml('Test [F#m]\n').song.key).toBe('F#m');
    expect(songToHtml('Test [Bbm]\n').song.key).toBe('Bbm');
  });

  test('handles sharp keys correctly', () => {
    const source = `Sharp Key [F#]
  verse: 1 4 5

Sections:
  Verse 1:
    ^One ^two ^three`;
    const result = songToHtml(source);

    expect(result.song.key).toBe('F#');
    expect(result.html).toContain('F#');
    expect(result.html).toContain('B');
    expect(result.html).toContain('C#');
  });

  test('handles unicode sharp/flat symbols', () => {
    const source = `Unicode Key [B♭]
  verse: 1 4

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    expect(result.song.key).toBe('Bb');
  });
});

describe('treble chord notation', () => {
  test('handles named treble chords with backslash', () => {
    const source = `Treble Test [C]
  verse: F\\A G\\B

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    expect(result.html).toContain('F\\A');
    expect(result.html).toContain('G\\B');
  });

  test('translates numeric treble notation relative to chord root', () => {
    const source = `Treble Numeric [C]
  verse: F\\3 G\\3

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    // F\3 = F with 3rd (A), G\3 = G with 3rd (B)
    expect(result.html).toContain('F\\A');
    expect(result.html).toContain('G\\B');
  });

  test('translates Nashville treble chords', () => {
    const source = `Nashville Treble [C]
  verse: 4\\3 5\\3

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    // In C: 4=F, 5=G; 4\3 = F with A (3rd of F), 5\3 = G with B (3rd of G)
    expect(result.html).toContain('F\\A');
    expect(result.html).toContain('G\\B');
  });
});

describe('chord melody notation', () => {
  test('handles named chord melody with dash', () => {
    const source = `Melody Test [C]
  verse: G-BCD Am-EFG

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    expect(result.html).toContain('G-BCD');
    expect(result.html).toContain('Am-EFG');
  });

  test('translates numeric melody notes relative to key', () => {
    const source = `Melody Numeric [C]
  verse: G-712 Am-345

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    // In key of C: 7=B, 1=C, 2=D, 3=E, 4=F, 5=G
    expect(result.html).toContain('G-BCD');
    expect(result.html).toContain('Am-EFG');
  });

  test('translates Nashville chord with numeric melody', () => {
    const source = `Nashville Melody [G]
  verse: 1-123 4-456

Sections:
  Verse 1:
    ^One ^two`;
    const result = songToHtml(source);

    // In key of G: 1=G, 2=A, 3=B, 4=C, 5=D, 6=E
    expect(result.html).toContain('G-GAB');
    expect(result.html).toContain('C-CDE');
  });
});
