# song2html

Song charts are translated into HTML so they can be displayed and stylized in a web browser.

Songs need to be specifically formatted as follows:

```
Title
  author: John Doe, Jane Doe
  key: C
  tempo: 128
  time: 4/4
  
  verses: A B C  D E F
  chorus: D E F  A B C
  bridge: G A B  C D E

Sections:
  Verse 1:
    ^Some lyrics ^are here
    ^carets are ^where chords ^go
    ^oh
  
  Chorus:
    ^If the ^section name starts with the ^same word as the section in the ^chord chart ^(after the title)
    it will use those chords in the ^section

  Verse 2:
    ^For example, all ^verses will all
    ^use the same chords, and chord-naming is ^pretty flexible.
    ^You can even use ^Nashville numbering.
  
  Bridge:
    ^Don't forget the colons, ^they're important.
    And if you have more carets than chords, it will just start at the beginning of the chord chart and keep going.

Arrangements:
  Live:
    Verse 1
    Chorus
    Verse 2
    Chorus
    Bridge
  
  Studio:
    Verse 1
    Verse 2
    Chorus
    Verse 1
    Chorus
    Bridge
    Chorus
```

* There will always be a _default_ arrangement which displays the sections in the order they are given.
* The first four, metadata lines under are reserved- you cannot have song-sections name `key`, `tempo`, `time`, or `author`.
* 


## Chord Notation

C or 1 - Major
- in this case 1 would be the root chord of the key
Dm or just 2 - Minor
- whether its minor depends on the key (2,3,6 are minor)
F/A or F/5 or 4/5 - bass note
- indicates a chord inversion with the A or 5 as the bass note
- in slash chords the numbers are relative to the _chord_ root, not the key root
F\D or F\3 or 4\3 - treble note
- indicates a chord inversion with the D or 3 as the treble note
- re: in slash chords the numbers are relative to the _chord_ root, not the key root
G-BCD or G-bcd or G-671 - chord melody
- the part after the dash is the melody notes
- in dash chords the numbers are relative to the _key_ root, not the chord root
A7 or 67 - position indicator
- a number after a chord indicates the position of the chord on the fretboard, or octave on piano
- 
