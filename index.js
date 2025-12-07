// SongToHtml.js – convert chord-lyric source (numeric or named) to HTML + arrangements
// Author: ChatGPT 2025-05-24 (rev-34)
//
// rev-34 (Nashville-number ↔ key translation)
//   - Reads a key in brackets on the title line, e.g. `Amazing Grace [D]`.
//   - Numeric chords 1-7 (including bass-notes such as `1/4`) are translated
//     to diatonic chords in that key. Quality follows the major scale pattern:
//       1 maj, 2 min, 3 min, 4 maj, 5 maj, 6 min, 7° (diminished).
//   - Non-numeric chords and accidentals remain untouched. Fret-glyph support
//     and all earlier fixes retained.
// ---------------------------------------------------------------------------

export function parseSong(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let idx = 0
  const sectionHeader = /^\s{2,}([\w -]+):\s*$/
  const sections = []
  while (idx < lines.length && !/^\s*Arrangements:/i.test(lines[idx])) {
    const match = lines[idx].match(sectionHeader)
    if (match) {
      const name = match[1].trim()
      sections.push(name)
      idx++
      while (
        idx < lines.length &&
        !sectionHeader.test(lines[idx]) &&
        !/^\s*Arrangements:/i.test(lines[idx])
      ) {
        idx++
      }
    } else {
      idx++
    }
  }

  const arrangements = {}
  if (idx < lines.length && /^\s*Arrangements:/i.test(lines[idx])) {
    idx++
    const head = /^\s{2,}([\w -]+):\s*$/
    while (idx < lines.length) {
      const matchHead = lines[idx].match(head)
      if (matchHead) {
        const name = matchHead[1].trim()
        idx++
        const items = []
        while (idx < lines.length && !head.test(lines[idx])) {
          if (lines[idx].trim()) items.push(lines[idx].trim())
          idx++
        }
        arrangements[name] = items
      } else {
        idx++
      }
    }
  }
  if (!Object.keys(arrangements).length) arrangements.default = sections

  return { sections, arrangements }
}

export default function songToHtml(source, arrangementName = '') {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let idx = 0

  // 1. Title & key -----------------------------------------------------------
  const titleLine = (lines[idx] ?? '').trim()
  const keyMatch = titleLine.match(/\[([A-Ga-g][♯#♭b]?m?)]$/)
  let songKey = keyMatch ? normalizeKey(keyMatch[1]) : null // e.g. "C", "F#", "Am"
  idx++

  // 2. Helpers for number→chord --------------------------------------------
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  // prefer flats for flat keys
  const flats = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' }
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11]
  const qualities = ['', 'm', 'm', '', '', 'm', 'dim']

  function normalizeKey(key) {
    return key.replace(/♯/g, '#').replace(/♭/g, 'b')
  }

  function semitone(note) {
    const up = note.toUpperCase()
    let index = chromatic.indexOf(up)
    if (index > -1) return index
    // flats
    const alt = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' }[up]
    return alt ? chromatic.indexOf(alt) : 0
  }

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

  // Convert scale degree to just the note name (no quality) relative to key
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

  // Convert interval number to note relative to a chord root (for treble chords)
  // e.g., interval 3 from F = A (major 3rd)
  const chordIntervals = [0, 0, 2, 4, 5, 7, 9, 11] // 1=unison, 2=M2, 3=M3, 4=P4, 5=P5, 6=M6, 7=M7
  function intervalToNote(chordRoot, interval) {
    const rootSemi = semitone(chordRoot)
    const noteSemi = (rootSemi + chordIntervals[interval % 8]) % 12
    let note = chromatic[noteSemi]
    if (/b$/.test(songKey) || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'].includes(songKey?.replace(/m$/, '') || '')) {
      note = flats[note] || note
    }
    return note
  }

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

  // 3. Fret glyphs -----------------------------------------------------------
  const FRET = ['', '⠂', '⠅', '⠇', '⠏', '⠗', '⠛', '⠞', '⠟', '⠥', '⠦', '⠧', '⠨', '⠩']
  const fmtChord = (chord) => {
    const base = chord.replace(/\|(\d{1,2})$/, (_, n) => FRET[+n] || n)
    return translateToken(base)
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
      `<section class="song-page" data-page="${pages.length + 1}">\n${pageBuffer.join('\n')}\n</section>`
    )
    pageBuffer = []
    currentWeight = 0
  }

  const metaLines = []
  if (songKey) metaLines.push(`<p class="song-meta-key"><strong>Key:</strong> ${esc(songKey)}</p>`)
  if (tempo !== null) metaLines.push(`<p class="song-meta-tempo"><strong>Tempo:</strong> ${tempo}</p>`)
  if (timeSig) metaLines.push(`<p class="song-meta-time"><strong>Time:</strong> ${esc(timeSig)}</p>`)
  if (authors.length) {
    const label = authors.length > 1 ? 'Authors' : 'Author'
    metaLines.push(`<p class="song-meta-authors"><strong>${label}:</strong> ${esc(authors.join(', '))}</p>`)
  }
  if (metaLines.length) {
    const metaSection = ['<section class="song-meta">', ...metaLines, '</section>']
    appendToPage(metaSection.join('\n'), metaLines.length * LINE_WEIGHTS.metaLine)
  }

  const chordSection = ['<section class="song-chords"><h3 class="chords-title">Chords</h3>']
  let chordParagraphCount = 0
  chosenArr.forEach((sec) => {
    const display = chordDisplay[sectionType(sec)] || []
    if (!display.length) return
    let html = `<span class="chord-section-label">${esc(sec)}</span> ` + spanLine(display[0])
    for (let i = 1; i < display.length; i++) {
      html += '<br class="line-break"/>' + spanLine(display[i])
    }
    chordSection.push(`<p class="chord-line">${html}</p>`)
    chordParagraphCount++
  })
  chordSection.push('</section>')
  const chordWeight =
    LINE_WEIGHTS.chordsHeading + chordParagraphCount * LINE_WEIGHTS.chordParagraph
  appendToPage(chordSection.join('\n'), chordWeight)

  chosenArr.forEach((sec) => {
    const sectionClass = `section-${sec.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const sectionStart = `<section class="song-section ${sectionClass}">`
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

    const headingHtml = `<h3 class="section-title">${esc(sec)}</h3>`

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
        return `<sup class="chord">${esc(fmtChord(chord))}</sup>`
      })
      appendToPage(`<p class="lyric-line">${htmlLine}</p>`, LINE_WEIGHTS.lyricLine, {
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

  const out = ['<article class="song">', pages.join('\n'), '</article>']

  const song = { key: songKey, tempo, authors, time: timeSig }
  return { html: out.join('\n'), arrangements: Object.keys(arrangements), song }

  // helper -------------------------------------------------------------
  function spanLine(str) {
    return str
      .split(/\s+/)
      .filter(Boolean)
      .map((c) => `<span class="chord">${esc(fmtChord(c))}</span>`)
      .join(' ')
  }

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

  function sectionType(sec) {
    return sec.split(/\s+/)[0].toLowerCase()
  }

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
