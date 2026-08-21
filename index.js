export { createSongAst, formatChord, formatKey, parseChord, parseKey, parseSong, semanticSong, serializeSong, transposeSongAst, validateSong } from './src/ast.js'
export { detectFormat, importChordPro, importChordsOverLyrics, importInlineBrackets, importOpenSong, importSong } from './src/importers.js'

/**
 * Converts a song source file into HTML markup with chord notation and lyrics.
 * @param {string} source - The raw song source text containing metadata, chords, lyrics, and arrangements.
 * @param {string} [arrangementName=''] - Optional name of the arrangement to use. Defaults to the first available arrangement.
 * @returns {{ html: string, arrangements: string[], song: { title: string, key: string|null, tempo: number|null, authors: string[], time: string|null, owner: string|null, license: string|null }, errata: Array<{ type: string, message: string, section?: string, line?: number }> }} An object containing the generated HTML, available arrangement names, song metadata, and parsing errata.
 */
export default function songToHtml(source, arrangementName = '') {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  const LIMITS = Object.freeze({ sourceLength: 1_000_000, lines: 20_000, repeat: 128, expandedChords: 10_000, sections: 1_000, arrangementEntries: 5_000 })
  if (source.length > LIMITS.sourceLength) throw new RangeError(`source exceeds ${LIMITS.sourceLength} characters`)
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > LIMITS.lines) throw new RangeError(`source exceeds ${LIMITS.lines} lines`)
  let idx = 0

  // Errata tracking for parsing issues
  const errata = []
  const issue = (severity, type, message, details = {}) => errata.push({ severity, type, message, ...details })

  // 1. Title & key -----------------------------------------------------------
  const titleLine = (lines[idx] ?? '').trim()
  const keyMatch = titleLine.match(/\[([A-Ga-g][♯#♭b]?m?)]$/)
  let songKey = keyMatch ? normalizeKey(keyMatch[1]) : null // e.g. "C", "F#", "Am"
  const songTitle = keyMatch ? titleLine.slice(0, -keyMatch[0].length).trim() : titleLine
  idx++

  // 2. Helpers for number→chord --------------------------------------------
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  // prefer flats for flat keys
  const flats = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11]
  const majorQualities = ['', 'm', 'm', '', '', 'm', 'dim']
  const minorIntervals = [0, 2, 3, 5, 7, 8, 10]
  const minorQualities = ['m', 'dim', '', 'm', 'm', '', '']
  const flatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']
  const preferFlats = (key) => /b/.test(key || '') || flatKeys.includes(key)

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
    return alt ? chromatic.indexOf(alt) : -1
  }

  /**
   * Converts a Nashville Number scale degree to a chord name.
   * @param {number} num - The scale degree (1-7).
   * @returns {string} The chord name with quality (e.g., "C", "Dm", "G").
   */
  function degreeToChord(num) {
    if (!songKey) return String(num) // no key ⇒ leave numeric
    if (!Number.isInteger(num) || num < 1 || num > 7) return String(num)
    const deg = (num - 1) % 7
    const isMinor = songKey.endsWith('m')
    const baseKey = songKey.replace(/m$/, '')
    const intervals = isMinor ? minorIntervals : majorIntervals
    const qualities = isMinor ? minorQualities : majorQualities
    const rootSemi = (semitone(baseKey) + intervals[deg]) % 12
    let root = chromatic[rootSemi]
    if (preferFlats(songKey)) {
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
    if (!Number.isInteger(num) || num < 1 || num > 7) return String(num)
    const deg = (num - 1) % 7
    const intervals = songKey.endsWith('m') ? minorIntervals : majorIntervals
    const rootSemi = (semitone(songKey.replace(/m$/, '')) + intervals[deg]) % 12
    let root = chromatic[rootSemi]
    if (preferFlats(songKey)) {
      root = flats[root] || root
    }
    return root
  }

  /**
   * Shifts the song key by a number of half steps.
   * @param {number} offset - Number of half steps to shift (positive or negative).
   * @returns {string|null} The shifted key, or null if no key is set.
   */
  function shiftKey(offset) {
    if (!songKey) return songKey
    const isMinor = songKey.endsWith('m')
    const base = isMinor ? songKey.slice(0, -1) : songKey
    const shifted = (semitone(base) + offset % 12 + 12) % 12
    let note = chromatic[shifted]
    if (preferFlats(songKey)) {
      note = flats[note] || note
    }
    return isMinor ? note + 'm' : note
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
    if (preferFlats(songKey)) {
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
    if (match[2]) out += '/' + degreeToNote(+match[2])
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
  let owner = null
  let license = null
  let foundSectionsHeader = false

  const validKey = (key) => /^[A-G](?:#|b)?m?$/.test(key) && semitone(key.replace(/m$/, '')) >= 0
  const bracketedKey = titleLine.match(/\[([^\]]+)]$/)
  if (bracketedKey && !keyMatch) {
    issue('error', 'invalid-key', `Invalid musical key: "${bracketedKey[1]}"`, { line: 1 })
  }

  while (idx < lines.length && !/^\s*Sections:/i.test(lines[idx])) {
    const meta = lines[idx].match(/^\s*(key|tempo|author|time|owner|license):\s*(.+)$/i)
    if (meta) {
      const tag = meta[1].toLowerCase()
      const val = meta[2].trim()
      switch (tag) {
        case 'key':
          songKey = normalizeKey(val)
          if (!validKey(songKey)) {
            issue('error', 'invalid-key', `Invalid musical key: "${val}"`, { line: idx + 1 })
            songKey = null
          }
          break
        case 'tempo': {
          const n = parseInt(val, 10)
          if (!Number.isNaN(n)) {
            tempo = n
          } else {
            issue('error', 'invalid-tempo', `Invalid tempo value: "${val}"`, { line: idx + 1 })
          }
          break
        }
        case 'author':
          authors = val.split(',').map((a) => a.trim()).filter(Boolean)
          break
        case 'time':
          timeSig = val
          break
        case 'owner':
          owner = val
          break
        case 'license':
          license = val
          break
        default:
          break
      }
      idx++
      continue
    }
    const chordLine = lines[idx].match(/^\s*([^:\r\n]+):\s*(.+)$/u)
    if (chordLine) {
      const key = chordLine[1].trim().toLowerCase()
      const display = [chordLine[2].trim()]
      let j = idx + 1
      while (
        j < lines.length &&
        /^\s{2,}\S/.test(lines[j]) &&
        !/^[^:\r\n]+:\s*/u.test(lines[j].trim())
      ) {
        display.push(lines[j].trim())
        j++
      }
      idx = j - 1
      chordDisplay[key] = display
      chordDefs[key] = expandProg(display.join(' '), idx + 1)
    } else if (lines[idx].trim()) {
      issue('warning', 'unrecognized-line', `Unrecognized metadata or chord line: "${lines[idx].trim()}"`, { line: idx + 1 })
    }
    idx++
  }

  // Check for missing key after all metadata is parsed
  if (!songKey) {
    issue('warning', 'missing-key', 'No musical key specified in title or metadata')
  }

  // 5. Lyric sections --------------------------------------------------------
  const lyricSections = {}
  const sectionTranspose = {}
  const sectionOrder = []
  const sectionHeaderRE = /^\s{2,}([^:\r\n]+):\s*$/u
  if (idx < lines.length && /^\s*Sections:/i.test(lines[idx])) foundSectionsHeader = true
  while (idx < lines.length && !/^\s*Arrangements:/i.test(lines[idx])) {
    const match = lines[idx].match(sectionHeaderRE)
    if (match) {
      const name = match[1].trim()
      if (sectionOrder.length >= LIMITS.sections) throw new RangeError(`song exceeds ${LIMITS.sections} sections`)
      sectionOrder.push(name)
      idx++
      const lns = []
      while (
        idx < lines.length &&
        !sectionHeaderRE.test(lines[idx]) &&
        !/^\s*Arrangements:/i.test(lines[idx])
      ) {
        const raw = lines[idx]
        if (raw.trim()) {
          const transposeMatch = raw.trim().match(/^<transpose\s*([+-]?\d+)>$/i)
          if (transposeMatch) {
            sectionTranspose[name] = parseInt(transposeMatch[1], 10)
          } else {
            lns.push(raw.replace(/^\s{4}/, ''))
          }
        }
        idx++
      }
      if (Object.hasOwn(lyricSections, name)) {
        issue('error', 'duplicate-section', `Section "${name}" is defined more than once; the first definition is retained`, { section: name })
      } else {
        lyricSections[name] = lns
      }
    } else {
      idx++
    }
  }

  if (!foundSectionsHeader) issue('error', 'missing-sections', 'Required Sections: header is missing')

  // 6. Arrangements ----------------------------------------------------------
  const arrangements = {}
  if (idx < lines.length && /^\s*Arrangements:/i.test(lines[idx])) {
    idx++
    while (idx < lines.length) {
      const headMatch = lines[idx].match(/^(\s{2,})([^:\r\n]+)\s*:?\s*$/u)
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
          if (ln.trim()) {
            if (secs.length >= LIMITS.arrangementEntries) throw new RangeError(`arrangement exceeds ${LIMITS.arrangementEntries} entries`)
            secs.push(ln.trim())
          }
          idx++
        }
        arrangements[arrName] = secs
      } else {
        idx++
      }
    }
  }
  if (!Object.keys(arrangements).length) arrangements.default = sectionOrder
  let chosenRaw
  if (arrangementName && !Object.hasOwn(arrangements, arrangementName)) {
    issue('error', 'unknown-arrangement', `Arrangement "${arrangementName}" does not exist`)
    chosenRaw = []
  } else {
    chosenRaw = arrangements[arrangementName] || arrangements[Object.keys(arrangements)[0]]
  }

  // Extract inline <transpose> directives from arrangement entries
  const arrTranspose = {}
  const chosenArr = chosenRaw.map((entry, i) => {
    const match = entry.match(/<transpose\s*([+-]?\d+)>/i)
    if (match) {
      arrTranspose[i] = parseInt(match[1], 10)
      return entry.replace(/<transpose\s*[+-]?\d+>/i, '').trim()
    }
    return entry
  })

  // Validate arrangement sections and track errata
  const trackedMissingChords = new Set()
  const trackedMissingSections = new Set()
  chosenArr.forEach((sec) => {
    const secType = sec.split(/\s+/)[0].toLowerCase()
    // Track missing chord definitions (only once per section type)
    if (!chordDisplay[secType] && !trackedMissingChords.has(secType)) {
      trackedMissingChords.add(secType)
      issue('warning', 'missing-chords', `No chord definition found for section type "${secType}"`, { section: sec })
    }
    // Track missing lyric sections
    if (!lyricSections[sec] && !trackedMissingSections.has(sec)) {
      trackedMissingSections.add(sec)
      issue('error', 'missing-section', `Section "${sec}" referenced in arrangement but not defined in Sections`, { section: sec })
    }
  })

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
    const footerLines = []
    if (owner) footerLines.push(`<span class="s2h-footer-owner">&copy; ${esc(owner)}</span>`)
    if (license) footerLines.push(`<span class="s2h-footer-license">${esc(license)}</span>`)
    const footer = footerLines.length
      ? `\n<footer class="s2h-page-footer">${footerLines.join(' ')}</footer>`
      : ''
    pages.push(
      `<section class="s2h-page" data-page="${pages.length + 1}">\n${pageBuffer.join('\n')}${footer}\n</section>`
    )
    pageBuffer = []
    currentWeight = 0
  }

  const metaLines = []
  metaLines.push(`<h2 class="s2h-meta-title">${esc(songTitle)}</h2>`)
  if (authors.length) {
    metaLines.push(`<p class="s2h-meta-authors">${esc(authors.join(', '))}</p>`)
  }
  if (songKey) metaLines.push(`<p class="s2h-meta-key"><strong>Key:</strong> ${esc(songKey)}</p>`)
  if (tempo !== null) metaLines.push(`<p class="s2h-meta-tempo"><strong>Tempo:</strong> ${tempo}</p>`)
  if (timeSig) metaLines.push(`<p class="s2h-meta-time"><strong>Time:</strong> ${esc(timeSig)}</p>`)
  if (metaLines.length) {
    const metaSection = ['<section class="s2h-meta">', ...metaLines, '</section>']
    appendToPage(metaSection.join('\n'), metaLines.length * LINE_WEIGHTS.metaLine)
  }

  const chordSection = ['<section class="s2h-chords"><h3 class="s2h-chords-title">Chords</h3>']
  let chordParagraphCount = 0
  chosenArr.forEach((sec, i) => {
    const display = chordDisplay[sectionType(sec)] || []
    if (!display.length) return
    const offset = (i in arrTranspose) ? arrTranspose[i] : (sectionTranspose[sec] || 0)
    const savedKey = songKey
    if (offset) songKey = shiftKey(offset)
    let html = `<span class="s2h-chord-section-label">${esc(sec)}</span> ` + spanLine(display[0])
    for (let j = 1; j < display.length; j++) {
      html += '<br class="s2h-line-break"/>' + spanLine(display[j])
    }
    songKey = savedKey
    chordSection.push(`<p class="s2h-chord-line">${html}</p>`)
    chordParagraphCount++
  })
  chordSection.push('</section>')
  const chordWeight =
    LINE_WEIGHTS.chordsHeading + chordParagraphCount * LINE_WEIGHTS.chordParagraph
  appendToPage(chordSection.join('\n'), chordWeight)

  const sectionOccurrences = {}
  chosenArr.forEach((sec, i) => {
    const sectionSlug = sec.normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, '') || 'section'
    sectionOccurrences[sectionSlug] = (sectionOccurrences[sectionSlug] || 0) + 1
    const occurrence = sectionOccurrences[sectionSlug]
    const sectionId = occurrence > 1 ? `${sectionSlug}-${occurrence}` : sectionSlug
    const sectionClass = `s2h-section-${sectionSlug}`
    const sectionStart = `<section id="${sectionId}" class="s2h-section ${sectionClass}">`
    const sectionEnd = '</section>'
    const lns = lyricSections[sec] || []
    const chordArr = chordDefs[sectionType(sec)] || []
    let ci = 0
    let sectionOpen = false

    // Apply transpose: arrangement-level overrides section-level
    const offset = (i in arrTranspose) ? arrTranspose[i] : (sectionTranspose[sec] || 0)
    const savedKey = songKey
    if (offset) songKey = shiftKey(offset)

    // Count carets in lyrics for this section
    const caretCount = lns.reduce((count, line) => count + (line.match(/\^/g) || []).length, 0)
    // Track chord/caret mismatch (when chords must cycle)
    if (caretCount > 0 && chordArr.length > 0 && caretCount > chordArr.length) {
      issue(
        'warning',
        'chord-caret-mismatch',
        `Section "${sec}" has ${caretCount} chord markers but only ${chordArr.length} chords defined (chords will cycle)`,
        { section: sec },
      )
    }

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
          appendToPage(`<h3 class="s2h-section-title s2h-section-title-continued">${esc(sec)} <span class="s2h-continued-label">(continued)</span></h3>`, LINE_WEIGHTS.sectionHeading)
        },
      })
    })

    songKey = savedKey
    closeSection()
  })

  flushPage()

  const out = ['<article class="s2h-song">', pages.join('\n'), '</article>']

  const song = { title: songTitle, key: songKey, tempo, authors, time: timeSig, owner, license }
  return { html: out.join('\n'), arrangements: Object.keys(arrangements), song, errata }

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
  function expandProg(exp, line) {
    const out = []
    const tokenRE = /\(([^()]*)\)\s*(?:x\s*(\d+))?|(\S+)/gi
    let match
    while ((match = tokenRE.exec(exp))) {
      if (match[1] !== undefined) {
        const group = match[1].trim().split(/\s+/).filter(Boolean)
        const repeat = match[2] ? Number(match[2]) : 1
        if (repeat < 1 || repeat > LIMITS.repeat) {
          issue('error', 'invalid-repeat', `Repeat multiplier x${repeat} must be between 1 and ${LIMITS.repeat}`, { line })
          continue
        }
        if (out.length + group.length * repeat > LIMITS.expandedChords) throw new RangeError(`progression exceeds ${LIMITS.expandedChords} expanded chords`)
        for (let n = 0; n < repeat; n++) out.push(...group)
      } else if (!/^x\d+$/i.test(match[3])) {
        if (/^[0-9](?:\/[0-9])?/.test(match[3]) && !/^[1-7](?:\/[1-7])?/.test(match[3])) {
          issue('error', 'invalid-degree', `Nashville scale degrees must be between 1 and 7: "${match[3]}"`, { line })
        }
        out.push(match[3])
      }
    }
    if (/[()]/.test(exp.replace(/\([^()]*\)/g, ''))) issue('error', 'malformed-repeat', `Malformed repetition expression: "${exp}"`, { line })
    return out
  }
}
