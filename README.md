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
* Parsing rules:
  * Blank lines are ignored
  * Windows line-endings (\r\n) and Unix line-endings (\n) are both supported.
* The very first line of the file is the song title.
  * Everything indented beneath the title is metadata about the song.
  * The following are some internally recognised song vars:
    * `key`
    * `tempo`
    * `time`
    * `author`
    * Other keys are presumed to be section names for chord charts.
      * Any chords after the section-name `<song-section-name>:` are assumed to be chords for that section- even if they span multiple lines.
      * Groups of chords in parentheses can be repeated by a following xN, where N is the number of times to repeat.
        * e.g. (C G Am F)x2  would expand to C G Am F C G Am F
* Segments
  * Segments are defined by a name followed by a colon.
  * Segments indented under the segment name belong to that segment.
    * 2-space indentation is used to define segments & metadata.
    * 4-space indentation is used to define content within song-sections and arrangements.
  * Segment names are not case-sensitive;  i.e. 'Arrangements' is the same as 'arrangements'.
  * Segments names cannot be:
    * `key`
    * `tempo`
    * `time`
    * `author`
  * The following are reserved segment names:
    * Arrangements
    * Sections
  * Segements beneath 'Sections' are song sections.
    * These segments can be named anything.
    * If a section name starts with the same word as a section in the chord chart (after the title), it will use those chords in that section.
      * e.g. 'Chorus' in the chord chart will be used in any section named 'Chorus', 'Chorus 1', 'Chorus A', etc.
    * Carets within the song sections indicate where chords go.
      * Chords are mapped from the corresponding chord chart metadata.
      * If there are more carets than chords in a line of lyrics, it will loop back to the beginning of the chord chart and continue assigning chords.
  * Segments beneath 'Arrangements' are arrangements.
    * These segments can be named anything.
    * Each line in an arrangement is the name of a song-section to include in that arrangement in the given order.
    * If no arrangements are defined, the default arrangement is used (which is the sections in the order written.)
* Output is paginated
  * First "page" is the title block, metdata, and chord chart
  * Subsequent pages contain song sections
  * Pages are separated after a certain number of lines (configurable in code)


**This is output of the example above**
```html
<article class="song">
<section class="song-page" data-page="1">
<section class="song-meta">
<p class="song-meta-key"><strong>Key:</strong> C</p>
<p class="song-meta-tempo"><strong>Tempo:</strong> 128</p>
<p class="song-meta-time"><strong>Time:</strong> 4/4</p>
<p class="song-meta-authors"><strong>Authors:</strong> John Doe, Jane Doe</p>
</section>
<section class="song-chords"><h3 class="chords-title">Chords</h3>
<p class="chord-line"><span class="chord-section-label">Chorus</span> <span class="chord">D</span> <span class="chord">E</span> <span class="chord">F</span> <span class="chord">A</span> <span class="chord">B</span> <span class="chord">C</span></p>
<p class="chord-line"><span class="chord-section-label">Chorus</span> <span class="chord">D</span> <span class="chord">E</span> <span class="chord">F</span> <span class="chord">A</span> <span class="chord">B</span> <span class="chord">C</span></p>
<p class="chord-line"><span class="chord-section-label">Bridge</span> <span class="chord">G</span> <span class="chord">A</span> <span class="chord">B</span> <span class="chord">C</span> <span class="chord">D</span> <span class="chord">E</span></p>
</section>
<section class="song-section section-verse-1">
<h3 class="section-title">Verse 1</h3>
<p class="lyric-line"><sup class="chord"></sup>Some lyrics <sup class="chord"></sup>are here</p>
<p class="lyric-line"><sup class="chord"></sup>carets are <sup class="chord"></sup>where chords <sup class="chord"></sup>go</p>
<p class="lyric-line"><sup class="chord"></sup>oh</p>
</section>
<section class="song-section section-chorus">
<h3 class="section-title">Chorus</h3>
<p class="lyric-line"><sup class="chord">D</sup>If the <sup class="chord">E</sup>section name starts with the <sup class="chord">F</sup>same word as the section in the <sup class="chord">A</sup>chord chart <sup class="chord">B</sup>(after the title)</p>
<p class="lyric-line">it will use those chords in the <sup class="chord">C</sup>section</p>
</section>
<section class="song-section section-verse-2">
<h3 class="section-title">Verse 2</h3>
<p class="lyric-line"><sup class="chord"></sup>For example, all <sup class="chord"></sup>verses will all</p>
<p class="lyric-line"><sup class="chord"></sup>use the same chords, and chord-naming is <sup class="chord"></sup>pretty flexible.</p>
<p class="lyric-line"><sup class="chord"></sup>You can even use <sup class="chord"></sup>Nashville numbering.</p>
</section>
<section class="song-section section-chorus">
<h3 class="section-title">Chorus</h3>
</section>
</section>
<section class="song-page" data-page="2">
<section class="song-section section-chorus">
<p class="lyric-line"><sup class="chord">D</sup>If the <sup class="chord">E</sup>section name starts with the <sup class="chord">F</sup>same word as the section in the <sup class="chord">A</sup>chord chart <sup class="chord">B</sup>(after the title)</p>
<p class="lyric-line">it will use those chords in the <sup class="chord">C</sup>section</p>
</section>
<section class="song-section section-bridge">
<h3 class="section-title">Bridge</h3>
<p class="lyric-line"><sup class="chord">G</sup>Don&#039;t forget the colons, <sup class="chord">A</sup>they&#039;re important.</p>
<p class="lyric-line">And if you have more carets than chords, it will just start at the beginning of the chord chart and keep going.</p>
</section>
</section>
</article>
```


## Chord Notation

* Notation
  * `N`
    * C or 1 - Major
      * in this case 1 would be the root chord of the key
    * Dm or 2 - Minor
      * whether its minor depends on the key (2,3,6 are minor)
  * `/`
    * F/A or F/5 or 4/5 - bass note
      * indicates a chord inversion with the A or 5 as the bass note
      * in slash chords the numbers are relative to the _chord_ root and rendered thusly
  * `\`
    * F\D or F\3 or 4\3 - treble note
      * indicates a chord inversion with the D or 3 as the treble note
      * in slash chords the numbers are relative to the _chord_ root and rendered thusly
  * `-`
    * G-BCD or G-bcd or G-671 - chord melody
      * the part after the dash is the melody notes
      * melody notes are not translated/transposed- just displayed as-is
  * `|`
  * `N#`
    * A7 or 67 - position indicator
      * a number after a chord indicates the position of the chord on the fretboard, or octave on piano
