#!/usr/bin/env node
// Node build of the song2html command-line tool (`npx song2html`). Flags and exit
// codes match the native binary in cli/; both call convert() in src/cli.js.
import { parseArgs } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { convert, INPUT_FORMATS, OUTPUT_FORMATS } from '../src/cli.js'
import { THEMES } from '../src/render.js'

const USAGE = `Usage: song2html [OPTIONS] [INPUTS]...

Convert chord charts (song2html, ChordPro, OpenSong, inline brackets, chords-over-lyrics) to HTML.
Inputs default to standard input ("-").

Options:
  -o, --output <FILE>        Write output to FILE instead of standard output
  -d, --out-dir <DIR>        Write one output per input into DIR (required for several inputs)
  -f, --from <FORMAT>        Input format [default: auto] [${INPUT_FORMATS.join(', ')}]
  -t, --to <FORMAT>          Output format [default: page] [${OUTPUT_FORMATS.join(', ')}]
  -a, --arrangement <NAME>   Arrangement to render (defaults to the first)
      --theme <THEME>        Page theme [${THEMES.join(', ')}]
      --lang <LANG>          Document language (BCP 47)
      --capo <FRET>          Show chord shapes for a capo on this fret (0-11)
      --transpose <STEPS>    Transpose the song by half steps (-11 to 11)
      --title <TITLE>        Title override for imported formats without metadata
      --key <KEY>            Key override for imported formats without metadata
      --check                Validate only: print diagnostics, write nothing, exit 1 on errors
      --strict               Exit 1 when any error diagnostics are reported
      --diagnostics <FORMAT> Diagnostics on stderr as text or json [default: text]
  -q, --quiet                Only print error diagnostics
  -h, --help                 Print help
  -V, --version              Print version
`

const EXTENSIONS = { page: 'html', fragment: 'html', json: 'json', ast: 'json', song2html: 'txt', preview: 'txt', arrangements: 'list' }

class UsageError extends Error {}

function parse(argv) {
  // parseArgs treats "--transpose -2" as ambiguous; attach negative numbers to their flag.
  const args = []
  for (let index = 0; index < argv.length; index++) {
    if (['--transpose', '--capo'].includes(argv[index]) && /^-\d+$/.test(argv[index + 1] ?? '')) args.push(`${argv[index]}=${argv[++index]}`)
    else args.push(argv[index])
  }
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' }, 'out-dir': { type: 'string', short: 'd' },
      from: { type: 'string', short: 'f', default: 'auto' }, to: { type: 'string', short: 't', default: 'page' },
      arrangement: { type: 'string', short: 'a' }, theme: { type: 'string' }, lang: { type: 'string' },
      capo: { type: 'string' }, transpose: { type: 'string' }, title: { type: 'string' }, key: { type: 'string' },
      check: { type: 'boolean' }, strict: { type: 'boolean' }, diagnostics: { type: 'string', default: 'text' },
      quiet: { type: 'boolean', short: 'q' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'V' },
    },
  })
  const integer = (name, min, max) => {
    if (values[name] === undefined) return undefined
    const number = Number(values[name])
    if (!/^-?\d+$/.test(values[name]) || number < min || number > max) throw new UsageError(`--${name} must be an integer from ${min} to ${max}`)
    return number
  }
  const oneOf = (name, allowed) => {
    if (values[name] !== undefined && !allowed.includes(values[name])) throw new UsageError(`invalid value '${values[name]}' for --${name} [possible values: ${allowed.join(', ')}]`)
    return values[name]
  }
  if (values.output && values['out-dir']) throw new UsageError('--output cannot be used with --out-dir')
  return {
    ...values, inputs: positionals,
    from: oneOf('from', INPUT_FORMATS), to: oneOf('to', OUTPUT_FORMATS), theme: oneOf('theme', THEMES),
    diagnostics: oneOf('diagnostics', ['text', 'json']), capo: integer('capo', 0, 11), transpose: integer('transpose', -11, 11),
  }
}

async function readInput(path) {
  if (path && path !== '-') return readFile(path, 'utf8')
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function report(label, diagnostics, options) {
  const shown = options.quiet ? diagnostics.filter((entry) => entry.severity === 'error') : diagnostics
  if (options.diagnostics === 'json') {
    process.stderr.write(`${JSON.stringify({ file: label, diagnostics: shown })}\n`)
    return
  }
  for (const entry of shown) {
    process.stderr.write(`${entry.line ? `${label}:${entry.line}` : label}: ${entry.severity}: ${entry.message} [${entry.code}]\n`)
  }
}

async function run(argv) {
  const options = parse(argv)
  if (options.help) { process.stdout.write(USAGE); return 0 }
  if (options.version) {
    const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    process.stdout.write(`song2html ${version}\n`)
    return 0
  }
  const inputs = options.inputs.length ? options.inputs : [null]
  if (inputs.length > 1 && !options['out-dir'] && !options.check) throw new UsageError('several inputs need --out-dir (or --check)')
  if (options['out-dir']) await mkdir(options['out-dir'], { recursive: true })
  let clean = true
  for (const input of inputs) {
    const label = input && input !== '-' ? input : '<stdin>'
    const source = await readInput(input)
    const result = convert({
      source, from: options.from, to: options.to, arrangement: options.arrangement, theme: options.theme,
      language: options.lang, capo: options.capo, transpose: options.transpose,
      sourceName: input && input !== '-' ? basename(input) : undefined, title: options.title, key: options.key,
    })
    report(label, result.diagnostics, options)
    const hasErrors = result.diagnostics.some((entry) => entry.severity === 'error')
    clean &&= !hasErrors
    if (options.check || (!result.output && hasErrors)) continue
    if (options['out-dir']) {
      const stem = input && input !== '-' ? basename(input, extname(input)) : 'song'
      await writeFile(join(options['out-dir'], `${stem}.${EXTENSIONS[options.to]}`), result.output)
    } else if (options.output) await writeFile(options.output, result.output)
    else process.stdout.write(result.output)
  }
  return clean || !(options.check || options.strict) ? 0 : 1
}

try {
  process.exitCode = await run(process.argv.slice(2))
} catch (error) {
  const usage = error instanceof UsageError || error.code?.startsWith?.('ERR_PARSE_ARGS')
  process.stderr.write(`song2html: ${error.message}${usage ? '\nRun song2html --help for usage.' : ''}\n`)
  process.exitCode = 2
}
