# Examples

This page provides various examples showing different features of song2html.

## Basic Song

A simple song with verses and a chorus:

```
Simple Song [G]
  author: Demo Author
  key: G
  tempo: 100
  time: 4/4

  verse: G C D G
  chorus: C G D G

Sections:
  Verse 1:
    ^Walking down the ^road today
    ^Singing songs a^long the way

  Chorus:
    ^This is the ^chorus part
    ^Straight from the ^heart

  Verse 2:
    ^Second verse has ^different words
    ^But uses the ^same chords
```

## Nashville Number System

Using numbers instead of chord names for easy transposition:

```
Nashville Song [D]
  author: Number Fan
  key: D
  tempo: 120

  verse: 1 4 5 1
  chorus: 4 1 5 1

Sections:
  Verse:
    ^Start on the ^one chord
    ^Go to the ^five

  Chorus:
    ^Four chord ^starts the chorus
    ^Back to ^one
```

When rendered in key of D:
- 1 → D
- 4 → G
- 5 → A

## Slash Chords

Specifying bass notes with slash notation:

```
Slash Chords Demo [C]
  key: C

  verse: C C/E F F/A G/B C

Sections:
  Verse:
    ^Walking ^bass line
    ^Goes ^up the ^scale to ^C
```

## Chord Repetition

Using parentheses and `xN` for repeated progressions:

```
Repetition Demo [Am]
  key: Am

  verse: (Am G F E)x2
  chorus: F G Am Am

Sections:
  Verse:
    ^The same four ^chords
    ^Repeat two ^times
    ^Makes for eight ^total
    ^Chord ^changes ^in ^all
```

The verse chords expand to: `Am G Am F E Am G Am F E`

## Multiple Arrangements

Different section orders for different performances:

```
Multi-Arrangement [E]
  author: Versatile Band
  key: E
  tempo: 140

  verse: E A B E
  chorus: A E B A
  bridge: C#m A E B

Sections:
  Verse 1:
    ^First verse ^lyrics here

  Verse 2:
    ^Second verse ^different words

  Chorus:
    ^Sing the ^chorus now

  Bridge:
    ^Building to the ^climax

Arrangements:
  Short:
    Verse 1
    Chorus
    Verse 2
    Chorus

  Full:
    Verse 1
    Chorus
    Verse 2
    Chorus
    Bridge
    Chorus
    Chorus

  Acoustic:
    Verse 1
    Verse 2
    Chorus
    Bridge
```

## Position Indicators

Adding fret positions for guitar:

```
Position Demo [A]
  key: A

  verse: A|5 D|5 E|7 A|5

Sections:
  Verse:
    ^Play A at ^5th fret
    ^E at ^7th position
```

## Chord Melody

Indicating melody notes over chords:

```
Melody Demo [F]
  key: F

  intro: F-CDE Bb-FAC C-EGC F

Sections:
  Intro:
    ^Arpeggiate ^up
    ^Back to ^root
```

## Treble Chords

Specifying the top note of a chord:

```
Treble Demo [G]
  key: G

  verse: G\D C\E D\A G\B

Sections:
  Verse:
    ^Top note ^matters
    ^For the ^voicing
```

## Waltz Time

A song in 3/4 time:

```
Waltz [C]
  author: Classical Style
  key: C
  tempo: 90
  time: 3/4

  verse: C G7 C
  chorus: F C G7 C

Sections:
  Verse:
    ^One two ^three
    ^One two ^three

  Chorus:
    ^Dancing in ^waltz ^time
    ^Round and round we ^go
```

## Flat Keys

Example in a flat key (Bb):

```
Flat Key Song [Bb]
  author: Jazz Player
  key: Bb
  tempo: 110

  verse: 1 4 5 1

Sections:
  Verse:
    ^In B-flat ^major
    ^Nashville numbers ^work great
```

Renders as: Bb, Eb, F, Bb (using flats, not sharps)

## Special Characters

Handling apostrophes and special characters:

```
Special Chars [D]
  author: O'Brien & O'Connor
  key: D

  verse: D G A D

Sections:
  Verse:
    ^It's a great ^day
    ^Don't you ^think?
    ^"Yes," ^she said
```

HTML entities are automatically escaped in the output.
