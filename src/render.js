import songToHtml from '../index.js'
import { formatChord, formatKey, parseSong, serializeSong } from './ast.js'

export const THEMES = ['print', 'stage', 'compact', 'large-type', 'dark']

export function previewPlain(source) {
  const parsed = typeof source === 'string' ? parseSong(source) : { song: source, diagnostics: [] }
  const song = parsed.song
  const definitions = new Map(song.chordDefinitions.map((entry) => [entry.id, entry]))
  const lines = [`${song.metadata.title}${formatKey(song.metadata.key) ? ` [${formatKey(song.metadata.key)}]` : ''}`]
  if (song.metadata.authors?.length) lines.push(`author: ${song.metadata.authors.join(', ')}`)
  for (const section of song.sections) {
    lines.push('', `## ${section.name}`)
    const progression = definitions.get(section.chordDefinitionId)?.progression || []
    let index = 0
    for (const line of section.lines) {
      let text = ''
      for (const part of line.parts) {
        if (part.type === 'chordEvent') {
          const chord = progression.length ? progression[index % progression.length] : null
          text += `[${chord ? formatChord(chord) : ''}]`
          index++
        } else text += part.text
      }
      lines.push(text || '')
    }
  }
  return { text: lines.join('\n'), song, diagnostics: parsed.diagnostics }
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character])
}

export function renderStandalone(source, arrangement = '', options = {}) {
  const parsed = typeof source === 'string' ? parseSong(source) : { song: source, diagnostics: [] }
  const { html, song } = songToHtml(serializeSong(parsed.song), arrangement)
  const errata = parsed.diagnostics
  const theme = THEMES.includes(options.theme) ? options.theme : 'print'
  const language = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(options.language || '') ? options.language : 'en'
  const page = `<!DOCTYPE html>
<html lang="${escapeHtml(language)}" data-s2h-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(song.title || 'Song')}</title>
<style>
  :root { --s2h-bg: #fff; --s2h-fg: #1d1d1d; --s2h-muted: #555; --s2h-accent: #763434; --s2h-panel: #f8f8f0; --s2h-chip: #e8e0d0; --s2h-size: 1rem; }
  * { box-sizing: border-box; }
  body { background: var(--s2h-bg); color: var(--s2h-fg); font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; font-size: var(--s2h-size); line-height: 1.6; }
  .s2h-page { margin-bottom: 2rem; break-after: page; }
  .s2h-page:last-child { break-after: auto; }
  .s2h-meta { margin-bottom: 1.5rem; border-bottom: 1px solid #999; padding-bottom: 1rem; }
  .s2h-meta-title { margin: 0 0 0.5rem; font-size: 1.8rem; }
  .s2h-meta p { margin: 0.2rem 0; color: var(--s2h-muted); }
  .s2h-chords { background: var(--s2h-panel); padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; }
  .s2h-chords-title { margin: 0 0 0.5rem; font-size: 1.1rem; }
  .s2h-chord-line { margin: 0.3rem 0; }
  .s2h-chord-section-label { font-weight: bold; margin-right: 0.5rem; }
  .s2h-chord-line .s2h-chord { display: inline-block; background: var(--s2h-chip); padding: 0.1rem 0.4rem; border-radius: 3px; margin: 0 0.15rem; font-weight: bold; font-size: 0.95rem; }
  .s2h-section { margin-bottom: 1.5rem; break-inside: avoid-page; }
  .s2h-section-title { font-size: 1.1rem; color: var(--s2h-muted); margin: 0 0 0.5rem; border-left: 3px solid currentColor; padding-left: 0.5rem; break-after: avoid; }
  .s2h-continued-label { font-weight: normal; font-style: italic; }
  .s2h-lyric-line { margin: 0.4rem 0; font-size: 1.1rem; position: relative; padding-top: 1.2rem; orphans: 2; widows: 2; }
  .s2h-lyric-line .s2h-chord { position: relative; top: -0.1rem; font-weight: bold; color: var(--s2h-accent); text-decoration: underline; text-decoration-thickness: 1px; font-size: 0.9rem; margin-right: 1px; }
  .s2h-page-footer { margin-top: 1rem; border-top: 1px solid #aaa; padding-top: 0.4rem; color: var(--s2h-muted); font-size: 0.8rem; }
  [data-s2h-theme="stage"] { --s2h-bg: #080b0d; --s2h-fg: #f4f5e9; --s2h-muted: #c6c9ba; --s2h-accent: #62d7ff; --s2h-panel: #171d21; --s2h-chip: #253038; --s2h-size: 1.25rem; max-width: 1100px; }
  [data-s2h-theme="dark"] { --s2h-bg: #171717; --s2h-fg: #eee; --s2h-muted: #bbb; --s2h-accent: #ffb4a8; --s2h-panel: #252525; --s2h-chip: #393939; }
  [data-s2h-theme="compact"] { --s2h-size: 0.85rem; max-width: 1000px; line-height: 1.35; }
  [data-s2h-theme="large-type"] { --s2h-size: 1.35rem; max-width: 1000px; }
  @media print {
    @page { size: auto; margin: 0.55in; }
    body { max-width: none; margin: 0; padding: 0; color: #000; background: #fff; }
    .s2h-page { margin: 0; }
    .s2h-section-title, .s2h-chords-title { break-after: avoid; }
    .s2h-page-footer { color: #222; }
    .s2h-lyric-line .s2h-chord { color: #000; font-weight: 800; text-decoration: underline; }
  }
  @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
</head>
<body>
${html}
</body>
</html>`
  return { page, song, errata }
}
