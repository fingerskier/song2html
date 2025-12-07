/**
 * @typedef {Object} SongToHtmlOptions
 * @property {string} [arrangementName=''] - Name of the arrangement to use. Defaults to the first available arrangement.
 * @property {boolean} [chords=true] - Whether to show the chord chart section.
 * @property {boolean} [title=true] - Whether to show the title block with song title, author, key, tempo, and time.
 */

/**
 * Converts a song source file into HTML markup with chord notation and lyrics.
 * @param {string} source - The raw song source text containing metadata, chords, lyrics, and arrangements.
 * @param {string|SongToHtmlOptions} [options=''] - Either an arrangement name (string) for backwards compatibility, or an options object.
 * @returns {{ html: string, arrangements: string[], song: { key: string|null, tempo: number|null, authors: string[], time: string|null, title: string } }} An object containing the generated HTML, available arrangement names, and song metadata.
 */
export default function songToHtml(source, options = '') {
  // Handle backwards compatibility: options can be a string (arrangementName) or an object
  let arrangementName = ''
  let showChords = true
  let showTitleBlock = true

  if (typeof options === 'string') {
    arrangementName = options
  } else if (typeof options === 'object' && options !== null) {
    arrangementName = options.arrangementName ?? ''
    showChords = options.chords ?? true
    showTitleBlock = options.title ?? true
  }
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let idx = 0

  // 1. Title & key -----------------------------------------------------------
  const titleLine = (lines[idx] ?? '').trim()
  const keyMatch = titleLine.match(/\[([A-Ga-g][♯#♭b]?m?)]$/)
  let songKey = keyMatch ? normalizeKey(keyMatch[1]) : null // e.g. "C", "F#", "Am"
  // Extract clean title without key brackets
  const songTitle = keyMatch ? titleLine.slice(0, -keyMatch[0].length).trim() : titleLine
  idx++

  // 2. Helpers for number→chord --------------------------------------------
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  // prefer flats for flat keys
  const flats = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11]
  const qualities = ['', 'm', 'm', '', '', 'm', 'dim']

  /**
   * Normalizes a musical key by converting Unicode sharp/flat symbols to ASCII.
   * @param {string} key - The key string (e.g., "F♯", "B♭m").
   * @returns {string} The normalized key with # and b characters.
   */
  function normalizeKey(key) {
    return key.replace(/♯/g, '#').replace(/♭/g, 'b')
  }

  /**
   * Converts a note name to its semitone index (0-11).
   * @param {string} note - The note name (e.g., "C", "F#", "Bb").
   * @returns {number} The semitone index where C=0, C#=1, ..., B=11.
   */
  function semitone(note) {
    const up = note.toUpperCase()
    let index = chromatic.indexOf(up)
    if (index > -1) return index
    // flats
    const alt = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' }[up]
    return alt ? chromatic.indexOf(alt) : 0
  }

  /**
   * Converts a Nashville Number scale degree to a chord name.
   * @param {number} num - The scale degree (1-7).
   * @returns {string} The chord name with quality (e.g., "C", "Dm", "G").
   */
  function degreeToChord(num) {
    if (!songKey) return String(num) // no key ⇒ leave numeric
    const deg = (num - 1) % 7
    const rootSemi = (semitone(songKey) + majorIntervals[deg]) % 12
    let root = chromatic[rootSemi]
    if (/b$/.test(songKey) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].includes(songKey)) {
      root = flats[root] || root // prefer flats in flat keys
    }
    return root + qualities[deg]
  }

  /**
   * Converts a scale degree to just the note name (no chord quality) relative to the song key.
   * @param {number} num - The scale degree (1-7).
   * @returns {string} The note name (e.g., "C", "D", "E").
   */
  function degreeToNote(num) {
    if (!songKey) return String(num)
    const deg = (num - 1) % 7
    const rootSemi = (semitone(songKey.replace(/m$/, '')) + majorIntervals[deg]) % 12
    let root = chromatic[rootSemi]
    if (/b$/.test(songKey) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].includes(songKey.replace(/m$/, ''))) {
      root = flats[root] || root
    }
    return root
  }

  // Interval semitones: 1=unison, 2=M2, 3=M3, 4=P4, 5=P5, 6=M6, 7=M7
  const chordIntervals = [0, 0, 2, 4, 5, 7, 9, 11]

  /**
   * Converts an interval number to a note name relative to a chord root (for treble chords).
   * @param {string} chordRoot - The root note of the chord (e.g., "F", "C#").
   * @param {number} interval - The interval number (1-7, e.g., 3 for major 3rd).
   * @returns {string} The resulting note name (e.g., interval 3 from F = "A").
   */
  function intervalToNote(chordRoot, interval) {
    const rootSemi = semitone(chordRoot)
    const noteSemi = (rootSemi + chordIntervals[interval % 8]) % 12
    let note = chromatic[noteSemi]
    if (/b$/.test(songKey) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].includes(songKey?.replace(/m$/, '') || '')) {
      note = flats[note] || note
    }
    return note
  }

  /**
   * Translates a chord token from Nashville Number notation to standard chord names.
   * Handles chord melodies (G-BCD), treble chords (F\D), bass slash chords (1/4), and plain numbers.
   * @param {string} tok - The chord token to translate.
   * @returns {string} The translated chord token with standard note names.
   */
  function translateToken(tok) {
    // Handle chord melody: G-BCD or G-671 (melody notes relative to key)
    const melodyMatch = tok.match(/^([A-Ga-g][♯#♭b]?m?|[1-7])-([A-Ga-g0-9♯#♭b]+)(.*)$/)
    if (melodyMatch) {
      let chord = melodyMatch[1]
      if (/^\d$/.test(chord)) chord = degreeToChord(+chord)
      const melodyPart = melodyMatch[2]
      // Convert numeric melody notes to actual notes
      const melodyNotes = melodyPart.split('').map(ch => {
        if (/[1-7]/.test(ch)) return degreeToNote(+ch)
        return ch.toUpperCase()
      }).join('')
      return chord + '-' + melodyNotes + (melodyMatch[3] || '')
    }

    // Handle treble chords: F\D or F\3 or 4\3 (treble note, numbers relative to chord root)
    const trebleMatch = tok.match(/^([A-Ga-g][♯#♭b]?m?|[1-7])\\([A-Ga-g][♯#♭b]?|[1-7])(.*)$/)
    if (trebleMatch) {
      let chord = trebleMatch[1]
      let chordRoot = chord
      if (/^\d$/.test(chord)) {
        chord = degreeToChord(+chord)
        chordRoot = chord.replace(/m|dim$/, '') // get just the root note
      } else {
        chordRoot = chord.replace(/m$/, '')
      }
      let treble = trebleMatch[2]
      if (/^\d$/.test(treble)) {
        treble = intervalToNote(chordRoot, +treble)
      }
      return chord + '\\' + treble.toUpperCase() + (trebleMatch[3] || '')
    }

    // Handle bass slash chords and plain Nashville numbers: 1/4, 6, 1sus, 5+
    const match = tok.match(/^(\d)(?:\/(\d))?(.*)$/)
    if (!match) return tok
    const chord = degreeToChord(+match[1])
    let out = chord
    if (match[2]) out += '/' + degreeToChord(+match[2])
    out += match[3] || ''
    return out
  }

  // 3. Position indicator -----------------------------------------------------
  /**
   * Formats a chord by translating the token while preserving position notation (N|#).
   * @param {string} chord - The chord string, possibly with position notation (e.g., "G|5").
   * @returns {string} The formatted chord with translated notation and preserved position.
   */
  const fmtChord = (chord) => {
    // Extract position indicator if present (e.g., "G|5" -> position "5")
    const posMatch = chord.match(/\|(\d{1,2})$/)
    const base = posMatch ? chord.slice(0, -posMatch[0].length) : chord
    const translated = translateToken(base)
    return posMatch ? `${translated}|${posMatch[1]}` : translated
  }

  // 4. Chord definitions -----------------------------------------------------
  const chordDefs = {}
  const chordDisplay = {}
  let tempo = null
  let authors = []
  let timeSig = null

  while (idx < lines.length && !/^\s*Sections:/i.test(lines[idx])) {
    const meta = lines[idx].match(/^\s*(key|tempo|author|time):\s*(.+)$/i)
    if (meta) {
      const tag = meta[1].toLowerCase()
      const val = meta[2].trim()
      switch (tag) {
        case 'key':
          songKey = normalizeKey(val)
          break
        case 'tempo': {
          const n = parseInt(val, 10)
          if (!Number.isNaN(n)) tempo = n
          break
        }
        case 'author':
          authors = val.split(',').map((a) => a.trim()).filter(Boolean)
          break
        case 'time':
          timeSig = val
          break
        default:
          break
      }
      idx++
      continue
    }
    const chordLine = lines[idx].match(/^[\s\t]*([\w -]+):\s*(.+)$/)
    if (chordLine) {
      const key = chordLine[1].trim().toLowerCase()
      const display = [chordLine[2].trim()]
      let j = idx + 1
      while (
        j < lines.length &&
        /^\s{2,}\S/.test(lines[j]) &&
        !/^[\w -]+:\s*/.test(lines[j].trim())
      ) {
        display.push(lines[j].trim())
        j++
      }
      idx = j - 1
      chordDisplay[key] = display
      chordDefs[key] = expandProg(display.join(' '))
    }
    idx++
  }

  // 5. Lyric sections --------------------------------------------------------
  const lyricSections = {}
  const sectionOrder = []
  const sectionHeaderRE = /^\s{2,}([\w -]+):\s*$/
  while (idx < lines.length && !/^\s*Arrangements:/i.test(lines[idx])) {
    const match = lines[idx].match(sectionHeaderRE)
    if (match) {
      const name = match[1].trim()
      sectionOrder.push(name)
      idx++
      const lns = []
      while (
        idx < lines.length &&
        !sectionHeaderRE.test(lines[idx]) &&
        !/^\s*Arrangements:/i.test(lines[idx])
      ) {
        const raw = lines[idx]
        if (raw.trim()) lns.push(raw.replace(/^\s{4}/, ''))
        idx++
      }
      lyricSections[name] = lns
    } else {
      idx++
    }
  }

  // 6. Arrangements ----------------------------------------------------------
  const arrangements = {}
  if (idx < lines.length && /^\s*Arrangements:/i.test(lines[idx])) {
    idx++
    while (idx < lines.length) {
      const headMatch = lines[idx].match(/^(\s{2,})([\w -]+)\s*:?\s*$/)
      if (headMatch) {
        const indent = headMatch[1].length
        const arrName = headMatch[2].trim()
        let look = idx + 1
        while (look < lines.length && !lines[look].trim()) look++
        const nextIndent =
          look < lines.length ? (/^(\s*)/.exec(lines[look]) || [''])[0].length : 0
        const isHeader = lines[idx].trim().endsWith(':') || nextIndent > indent
        if (!isHeader) {
          idx++
          continue
        }
        idx++
        const secs = []
        while (idx < lines.length) {
          const ln = lines[idx]
          const lnIndent = (/^(\s*)/.exec(ln) || [''])[0].length
          if (lnIndent <= indent) break
          if (ln.trim()) secs.push(ln.trim())
          idx++
        }
        arrangements[arrName] = secs
      } else {
        idx++
      }
    }
  }
  if (!Object.keys(arrangements).length) arrangements.default = sectionOrder
  const chosenArr =
    arrangements[arrangementName] || arrangements[Object.keys(arrangements)[0]]

  // 7. Build HTML ------------------------------------------------------------
  const PAGE_BUDGET = 28
  const LINE_WEIGHTS = {
    // Heuristic weights so pages can be tuned later:
    //   - Meta data lines ~1 unit each
    //   - Chord headings ~2 units, chord paragraphs ~2 units
    //   - Section headings ~2 units, lyric lines ~1 unit
    metaLine: 1,
    chordsHeading: 2,
    chordParagraph: 2,
    sectionHeading: 2,
    lyricLine: 1,
  }

  const pages = []
  let pageBuffer = []
  let currentWeight = 0

  const appendToPage = (html, weight = 0, options = {}) => {
    const { beforeFlush, afterFlush } = options
    if (currentWeight > 0 && currentWeight + weight > PAGE_BUDGET) {
      if (beforeFlush) beforeFlush()
      flushPage()
      if (afterFlush) afterFlush()
    }
    pageBuffer.push(html)
    currentWeight += weight
  }

  const flushPage = () => {
    if (!pageBuffer.length) return
    pages.push(
      `<section class="s2h-page" data-page="${pages.length + 1}">\n${pageBuffer.join('\n')}\n</section>`
    )
    pageBuffer = []
    currentWeight = 0
  }

  // Title block section (controlled by title option)
  if (showTitleBlock && songTitle) {
    const titleLines = []
    titleLines.push(`<h1 class="s2h-title-name">${esc(songTitle)}</h1>`)
    if (authors.length) {
      const label = authors.length > 1 ? 'Authors' : 'Author'
      titleLines.push(`<p class="s2h-title-authors"><span class="s2h-title-label">${label}:</span> ${esc(authors.join(', '))}</p>`)
    }
    const metaDetails = []
    if (songKey) metaDetails.push(`<span class="s2h-title-key"><span class="s2h-title-label">Key:</span> ${esc(songKey)}</span>`)
    if (tempo !== null) metaDetails.push(`<span class="s2h-title-tempo"><span class="s2h-title-label">Tempo:</span> ${tempo}</span>`)
    if (timeSig) metaDetails.push(`<span class="s2h-title-time"><span class="s2h-title-label">Time:</span> ${esc(timeSig)}</span>`)
    if (metaDetails.length) {
      titleLines.push(`<p class="s2h-title-meta">${metaDetails.join(' <span class="s2h-title-separator">|</span> ')}</p>`)
    }
    const titleSection = ['<section class="s2h-title">', ...titleLines, '</section>']
    const titleWeight = 2 + (authors.length ? 1 : 0) + (metaDetails.length ? 1 : 0)
    appendToPage(titleSection.join('\n'), titleWeight)
  }

  // Legacy meta section (for backwards compatibility - only shown if title is false)
  const metaLines = []
  if (!showTitleBlock) {
    if (songKey) metaLines.push(`<p class="s2h-meta-key"><strong>Key:</strong> ${esc(songKey)}</p>`)
    if (tempo !== null) metaLines.push(`<p class="s2h-meta-tempo"><strong>Tempo:</strong> ${tempo}</p>`)
    if (timeSig) metaLines.push(`<p class="s2h-meta-time"><strong>Time:</strong> ${esc(timeSig)}</p>`)
    if (authors.length) {
      const label = authors.length > 1 ? 'Authors' : 'Author'
      metaLines.push(`<p class="s2h-meta-authors"><strong>${label}:</strong> ${esc(authors.join(', '))}</p>`)
    }
  }
  if (metaLines.length) {
    const metaSection = ['<section class="s2h-meta">', ...metaLines, '</section>']
    appendToPage(metaSection.join('\n'), metaLines.length * LINE_WEIGHTS.metaLine)
  }

  // Chord chart section (controlled by chords option)
  if (showChords) {
    const chordSection = ['<section class="s2h-chords"><h3 class="s2h-chords-title">Chords</h3>']
    let chordParagraphCount = 0
    chosenArr.forEach((sec) => {
      const display = chordDisplay[sectionType(sec)] || []
      if (!display.length) return
      let html = `<span class="s2h-chord-section-label">${esc(sec)}</span> ` + spanLine(display[0])
      for (let i = 1; i < display.length; i++) {
        html += '<br class="s2h-line-break"/>' + spanLine(display[i])
      }
      chordSection.push(`<p class="s2h-chord-line">${html}</p>`)
      chordParagraphCount++
    })
    chordSection.push('</section>')
    const chordWeight =
      LINE_WEIGHTS.chordsHeading + chordParagraphCount * LINE_WEIGHTS.chordParagraph
    appendToPage(chordSection.join('\n'), chordWeight)
  }

  chosenArr.forEach((sec) => {
    const sectionClass = `s2h-section-${sec.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const sectionStart = `<section class="s2h-section ${sectionClass}">`
    const sectionEnd = '</section>'
    const lns = lyricSections[sec] || []
    const chordArr = chordDefs[sectionType(sec)] || []
    let ci = 0
    let sectionOpen = false

    const openSection = () => {
      if (!sectionOpen) {
        appendToPage(sectionStart)
        sectionOpen = true
      }
    }

    const closeSection = () => {
      if (sectionOpen) {
        pageBuffer.push(sectionEnd)
        sectionOpen = false
      }
    }

    const headingHtml = `<h3 class="s2h-section-title">${esc(sec)}</h3>`

    openSection()
    appendToPage(headingHtml, LINE_WEIGHTS.sectionHeading, {
      beforeFlush: () => {
        closeSection()
      },
      afterFlush: () => {
        openSection()
      },
    })

    lns.forEach((line) => {
      const htmlLine = processLyric(line, () => {
        const chord = chordArr[ci % chordArr.length] || ''
        ci++
        return `<sup class="s2h-chord">${esc(fmtChord(chord))}</sup>`
      })
      appendToPage(`<p class="s2h-lyric-line">${htmlLine}</p>`, LINE_WEIGHTS.lyricLine, {
        beforeFlush: () => {
          closeSection()
        },
        afterFlush: () => {
          openSection()
        },
      })
    })

    closeSection()
  })

  flushPage()

  const out = ['<article class="s2h-song">', pages.join('\n'), '</article>']

  const song = { title: songTitle, key: songKey, tempo, authors, time: timeSig }
  return { html: out.join('\n'), arrangements: Object.keys(arrangements), song }

  // helper -------------------------------------------------------------

  /**
   * Converts a space-separated chord string into HTML spans.
   * @param {string} str - Space-separated chord tokens.
   * @returns {string} HTML string with each chord wrapped in a span.
   */
  function spanLine(str) {
    return str
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => `<span class="s2h-chord">${esc(fmtChord(c))}</span>`)
      .join(' ')
  }

  /**
   * Escapes HTML special characters in a string.
   * @param {*} value - The value to escape (will be converted to string).
   * @returns {string} The HTML-escaped string.
   */
  function esc(value) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return String(value).replace(/[&<>"']/g, (ch) => map[ch] ?? ch)
  }

  /**
   * Extracts the base section type from a section name (e.g., "Verse 1" -> "verse").
   * @param {string} sec - The section name.
   * @returns {string} The lowercase base section type.
   */
  function sectionType(sec) {
    return sec.split(/\s+/)[0].toLowerCase()
  }

  /**
   * Processes a lyric line, replacing caret (^) markers with injected chord HTML.
   * @param {string} line - The lyric line with ^ markers for chord placement.
   * @param {function(): string} inject - Callback that returns the HTML to inject at each ^ marker.
   * @returns {string} The processed HTML string with chords injected.
   */
  function processLyric(line, inject) {
    let output = ''
    let last = 0
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '^') {
        output += esc(line.slice(last, i)) + inject()
        last = i + 1
      }
    }
    return output + esc(line.slice(last))
  }

  /**
   * Expands a chord progression string, handling parenthesized groups and repeat notation (xN).
   * @param {string} exp - The chord progression expression (e.g., "(1 4) x2 5").
   * @returns {string[]} Array of expanded chord tokens.
   */
  function expandProg(exp) {
    const tokens = exp.split(/\s+/).filter(Boolean)
    const out = []
    for (let i = 0; i < tokens.length; i++) {
      let token = tokens[i]
      if (token.startsWith('(')) {
        const group = []
        if (token.endsWith(')')) {
          group.push(token.slice(1, -1))
        } else {
          group.push(token.slice(1))
          while (++i < tokens.length && !tokens[i].endsWith(')')) {
            group.push(tokens[i])
          }
          if (i < tokens.length) group.push(tokens[i].slice(0, -1))
        }
        let repeat = 1
        if (i + 1 < tokens.length && /^x\d+$/i.test(tokens[i + 1])) {
          repeat = +tokens[++i].slice(1)
        }
        while (repeat--) out.push(...group)
      } else if (!/^x\d+$/i.test(token)) {
        out.push(token)
      }
    }
    return out
  }
}
