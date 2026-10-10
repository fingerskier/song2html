// Music theory primitives shared by the parser, renderer, transposer, and importers.
// Notes are spelled by letter so that scale degrees keep their letter names
// (F# major's seventh degree is E#, not F) and transposition picks a sensible
// target key spelling instead of inheriting the source key's sharp/flat bias.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11]
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]
const MAJOR_TRIADS = ['', 'm', 'm', '', '', 'm', 'dim']
const MINOR_TRIADS = ['m', 'dim', '', 'm', 'm', '', '']

// Preferred key spellings by pitch class. Arrays are [sharp-side, flat-side] ties.
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', ['F#', 'Gb'], 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_KEYS = ['C', 'C#', 'D', ['D#', 'Eb'], 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
// Spellings for transposing chords when no key is known.
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const COMMON_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const ACC = '[#b♯♭]'
// Chord quality vocabulary: maj7, m7b5, sus2sus4, 7sus4, madd9, 6/9, °, ø, Δ, +, alt, (b9) …
const QUALITY = String.raw`(?:maj|ma|min|mi|dim|aug|sus|add|no|omit|alt|m|M|°|ø|Δ|\+|6\/9|[#b♯♭]?\d{1,2}|[(),])*`
const TREBLE = String.raw`(?:\\(?:[A-G]${ACC}?|[1-7]))?`
const MELODY = String.raw`(?:-[A-Ga-g1-7#b♯♭]+)?`
const NAMED_RE = new RegExp(`^([A-G]${ACC}?)(${QUALITY})(?:\\/([A-G]${ACC}?))?(${TREBLE})(${MELODY})$`)
const NASHVILLE_RE = new RegExp(`^(${ACC}?)([1-7])(${QUALITY})(?:\\/(${ACC}?)([1-7]))?(${QUALITY})(${TREBLE})(${MELODY})$`)
const NO_CHORD_RE = /^(?:N\.?C\.?)$/i
const EXPLICIT_TRIAD_RE = /^(?:maj|ma|M|Δ|m|min|mi|dim|°|ø|aug|\+|sus|5$|alt)/

const mod12 = (value) => ((value % 12) + 12) % 12
const normalizeAccidentals = (value) => String(value).replaceAll('♯', '#').replaceAll('♭', 'b')

export function parseNote(value) {
  const match = normalizeAccidentals(value).match(/^([A-Ga-g])(##|bb|#|b)?$/)
  if (!match) return null
  const accidental = match[2] || ''
  return { letter: match[1].toUpperCase(), alter: accidental.startsWith('#') ? accidental.length : -accidental.length }
}

export const noteName = (note) => note.letter + (note.alter > 0 ? '#'.repeat(note.alter) : 'b'.repeat(-note.alter))
const letterIndex = (note) => LETTERS.indexOf(note.letter)
export const pitchClass = (note) => mod12(NATURAL_PC[letterIndex(note)] + note.alter)

function spell(letterIdx, pc, preferFlats) {
  const letter = LETTERS[((letterIdx % 7) + 7) % 7]
  let alter = mod12(pc - NATURAL_PC[LETTERS.indexOf(letter)])
  if (alter > 6) alter -= 12
  // Double sharps and flats are correct but unreadable on a chord chart.
  if (Math.abs(alter) > 1) return parseNote((preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)])
  return { letter, alter }
}

export function parseKey(value) {
  if (!value) return null
  const match = normalizeAccidentals(value).trim().match(/^([A-Ga-g])([#b]?)(m?)$/)
  if (!match) return null
  return { tonic: match[1].toUpperCase() + match[2], mode: match[3] ? 'minor' : 'major' }
}

export function formatKey(key) {
  return key ? `${key.tonic}${key.mode === 'minor' ? 'm' : ''}` : ''
}

const scaleSteps = (key) => (key.mode === 'minor' ? MINOR_STEPS : MAJOR_STEPS)

const flatKeyCache = new Map()

/** True when the key signature uses flats (F, Bb, Dm, Gm, …). */
export function keyPrefersFlats(key) {
  if (!key) return false
  const name = formatKey(key)
  if (flatKeyCache.has(name)) return flatKeyCache.get(name)
  const tonic = parseNote(key.tonic)
  let flats = false
  if (tonic) flats = tonic.alter !== 0 ? tonic.alter < 0 : scaleSteps(key).some((step, degree) => spell(letterIndex(tonic) + degree, pitchClass(tonic) + step, false).alter < 0)
  flatKeyCache.set(name, flats)
  return flats
}

/** Spells scale degree 1-7 (optionally altered by ±1) in a key. */
export function scaleDegreeNote(key, degree, alter = 0) {
  const tonic = parseNote(key.tonic)
  return spell(letterIndex(tonic) + degree - 1, pitchClass(tonic) + scaleSteps(key)[degree - 1] + alter, keyPrefersFlats(key))
}

/** Diatonic triad quality for a scale degree ('', 'm', or 'dim'). */
export const diatonicQuality = (key, degree) => (key.mode === 'minor' ? MINOR_TRIADS : MAJOR_TRIADS)[degree - 1]

/** Transposes a key by semitones and chooses the conventional spelling of the result. */
export function transposeKey(key, steps) {
  if (!key) return key
  if (mod12(steps) === 0) return { ...key }
  const tonic = parseNote(key.tonic)
  const choice = (key.mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS)[mod12(pitchClass(tonic) + steps)]
  return { tonic: Array.isArray(choice) ? choice[keyPrefersFlats(key) ? 1 : 0] : choice, mode: key.mode }
}

/**
 * Transposes one note. With known source and target keys the letter distance follows
 * the keys (G→Bb moves every letter by two); otherwise a readable default spelling is used.
 */
export function transposeNote(value, steps, fromKey = null, toKey = null) {
  const note = typeof value === 'string' ? parseNote(value) : value
  if (!note) return value
  const pc = pitchClass(note) + steps
  if (fromKey && toKey) {
    const shift = letterIndex(parseNote(toKey.tonic)) - letterIndex(parseNote(fromKey.tonic))
    return noteName(spell(letterIndex(note) + shift, pc, keyPrefersFlats(toKey)))
  }
  const names = note.alter < 0 ? FLAT_NAMES : note.alter > 0 ? SHARP_NAMES : COMMON_NAMES
  return names[mod12(pc)]
}

/** Note a major-scale interval (1-7) above a chord root, used by treble notation (F\3 → A). */
export function intervalAbove(rootName, interval, preferFlats = false) {
  const root = parseNote(rootName)
  if (!root) return String(interval)
  return noteName(spell(letterIndex(root) + interval - 1, pitchClass(root) + MAJOR_STEPS[interval - 1], preferFlats))
}

const alterOf = (accidental) => (accidental === '#' || accidental === '♯' ? 1 : accidental ? -1 : 0)
const withAlter = (node, alter) => (alter ? { ...node, alter } : node)
const cleanNote = (value) => noteName(parseNote(value))

function parseTreble(value) {
  if (!value) return null
  const body = value.slice(1)
  return /^[1-7]$/.test(body) ? { type: 'interval', interval: Number(body) } : { type: 'note', note: cleanNote(body) }
}

function parseMelody(value) {
  if (!value) return null
  const notes = []
  const body = value.slice(1)
  const matcher = /([A-G])([#b♯♭]?)|([a-g])|([1-7])/y
  let match
  while (matcher.lastIndex < body.length && (match = matcher.exec(body))) {
    if (match[4]) notes.push({ type: 'scaleDegree', degree: Number(match[4]) })
    else notes.push({ type: 'note', note: cleanNote((match[1] || match[3]) + (match[2] || '')) })
  }
  return notes
}

/**
 * Parses one chord token into a structured chord node.
 * notation: 'named' (G, Bbmaj7/D, C7sus4), 'nashville' (1, 6m, b7, 4/1, #4dim),
 * 'rest' (N.C.), or 'unknown'.
 */
export function parseChord(token, loc) {
  const raw = String(token)
  const positionMatch = raw.match(/\|(\d{1,2})$/)
  const position = positionMatch ? Number(positionMatch[1]) : null
  const base = positionMatch ? raw.slice(0, -positionMatch[0].length) : raw
  const common = { position, raw, ...(loc ? { location: loc } : {}) }
  if (NO_CHORD_RE.test(base)) return { type: 'chord', notation: 'rest', ...common }
  const nashville = base.match(NASHVILLE_RE)
  if (nashville) {
    return {
      type: 'chord', notation: 'nashville', ...withAlter({ degree: Number(nashville[2]) }, alterOf(nashville[1])),
      quality: nashville[3] + nashville[6],
      bass: nashville[5] ? withAlter({ type: 'scaleDegree', degree: Number(nashville[5]) }, alterOf(nashville[4])) : null,
      treble: parseTreble(nashville[7]), melody: parseMelody(nashville[8]), ...common,
    }
  }
  const named = base.match(NAMED_RE)
  if (named) {
    return {
      type: 'chord', notation: 'named', root: cleanNote(named[1]), quality: named[2],
      bass: named[3] ? { type: 'note', note: cleanNote(named[3]) } : null,
      treble: parseTreble(named[4]), melody: parseMelody(named[5]), ...common,
    }
  }
  return { type: 'chord', notation: 'unknown', ...common }
}

const formatDegree = (node) => `${node.alter > 0 ? '#' : node.alter < 0 ? 'b' : ''}${node.degree}`
const formatTreble = (treble) => (treble ? `\\${treble.type === 'interval' ? treble.interval : treble.note}` : '')
const formatMelody = (melody) => (melody?.length ? `-${melody.map((note) => (note.type === 'scaleDegree' ? note.degree : note.note)).join('')}` : '')
const formatPosition = (chord) => (chord.position == null ? '' : `|${chord.position}`)

/** Canonical source text for a chord node. */
export function formatChord(chord) {
  if (chord.notation === 'nashville') {
    return `${formatDegree(chord)}${chord.quality || ''}${chord.bass ? `/${formatDegree(chord.bass)}` : ''}${formatTreble(chord.treble)}${formatMelody(chord.melody)}${formatPosition(chord)}`
  }
  if (chord.notation === 'named') {
    return `${chord.root}${chord.quality || ''}${chord.bass ? `/${chord.bass.note}` : ''}${formatTreble(chord.treble)}${formatMelody(chord.melody)}${formatPosition(chord)}`
  }
  if (chord.notation === 'rest') return `N.C.${formatPosition(chord)}`
  return chord.raw
}

/** Quality for a Nashville chord: explicit triad qualities win, extensions stack on the diatonic triad. */
function nashvilleQuality(key, chord) {
  const triad = chord.alter ? '' : diatonicQuality(key, chord.degree)
  const quality = chord.quality || ''
  if (!quality) return triad
  if (EXPLICIT_TRIAD_RE.test(quality)) return quality
  if (triad === 'dim' && quality.startsWith('7')) return `m7b5${quality.slice(1)}`
  return triad + quality
}

/** Transposes the note-bearing parts of a named chord. Nashville chords are returned unchanged. */
export function transposeChord(chord, steps, fromKey = null, toKey = null) {
  if (chord.notation !== 'named' || mod12(steps) === 0) return chord
  const move = (note) => transposeNote(note, steps, fromKey, toKey)
  const next = {
    ...chord,
    root: move(chord.root),
    bass: chord.bass ? { ...chord.bass, note: move(chord.bass.note) } : null,
    treble: chord.treble?.type === 'note' ? { ...chord.treble, note: move(chord.treble.note) } : chord.treble,
    melody: chord.melody ? chord.melody.map((note) => (note.type === 'note' ? { ...note, note: move(note.note) } : note)) : chord.melody,
  }
  next.raw = formatChord(next)
  return next
}

/**
 * Resolves a chord to display text.
 * context.key: key for Nashville degrees and numeric melody notes (already transposed).
 * context.shift / fromKey / toKey: semitone shift applied to named chords (used by capo).
 */
export function resolveChord(chord, context = {}) {
  if (!chord) return ''
  const { key = null, shift = 0, fromKey = null, toKey = null } = context
  if (chord.notation === 'unknown') return chord.raw
  if (chord.notation === 'rest') return formatChord(chord)
  const flats = keyPrefersFlats(key)
  const melodyText = (melody) => formatMelody(melody?.map((note) => (note.type === 'scaleDegree' && key ? { type: 'note', note: noteName(scaleDegreeNote(key, note.degree)) } : note)))
  if (chord.notation === 'named') {
    const moved = transposeChord(chord, shift, fromKey, toKey)
    const treble = moved.treble?.type === 'interval' ? { type: 'note', note: intervalAbove(moved.root, moved.treble.interval, flats) } : moved.treble
    return `${moved.root}${moved.quality || ''}${moved.bass ? `/${moved.bass.note}` : ''}${formatTreble(treble)}${melodyText(moved.melody)}${formatPosition(moved)}`
  }
  if (!key) return formatChord(chord)
  const root = noteName(scaleDegreeNote(key, chord.degree, chord.alter || 0))
  const bass = chord.bass ? `/${noteName(scaleDegreeNote(key, chord.bass.degree, chord.bass.alter || 0))}` : ''
  const treble = chord.treble?.type === 'interval' ? { type: 'note', note: intervalAbove(root, chord.treble.interval, flats) } : chord.treble
  return `${root}${nashvilleQuality(key, chord)}${bass}${formatTreble(treble)}${melodyText(chord.melody)}${formatPosition(chord)}`
}
