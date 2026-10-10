//! song2html command-line tool.
//!
//! The parser, importers, and renderer are the same JavaScript modules that ship in
//! the npm package, embedded at compile time and run in QuickJS. There is exactly one
//! implementation of the format; this binary only handles arguments and files.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::{Parser, ValueEnum};
use rquickjs::loader::{BuiltinLoader, BuiltinResolver};
use rquickjs::{CatchResultExt, Context, Function, Module, Runtime};
use serde::{Deserialize, Serialize};

const MODULES: &[(&str, &str)] = &[
    ("src/theory.js", include_str!("../../src/theory.js")),
    ("src/ast.js", include_str!("../../src/ast.js")),
    ("src/html.js", include_str!("../../src/html.js")),
    ("src/render.js", include_str!("../../src/render.js")),
    ("src/importers.js", include_str!("../../src/importers.js")),
    ("src/cli.js", include_str!("../../src/cli.js")),
];

const BOOTSTRAP: &str = "import { convertJson } from './cli.js'\nglobalThis.__s2hConvert = convertJson\n";

#[derive(Copy, Clone, Debug, PartialEq, Eq, ValueEnum)]
enum From {
    Auto,
    Song2html,
    Chordpro,
    InlineBrackets,
    Opensong,
    ChordsOverLyrics,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, ValueEnum)]
enum To {
    /// Standalone HTML page with embedded styles
    Page,
    /// HTML fragment (<article class="s2h-song">) for embedding
    Fragment,
    /// { html, arrangements, song, errata } as JSON
    Json,
    /// Canonical Song AST as JSON
    Ast,
    /// Canonical song2html source (convert or normalize charts)
    Song2html,
    /// Arrangement names, one per line
    Arrangements,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq, ValueEnum)]
enum Theme {
    Print,
    Stage,
    Compact,
    LargeType,
    Dark,
}

/// Convert chord charts (song2html, ChordPro, OpenSong, inline brackets, chords-over-lyrics) to HTML.
#[derive(Parser, Debug)]
#[command(name = "song2html", version, about, long_about = None)]
struct Cli {
    /// Input files ("-" or none reads standard input)
    inputs: Vec<PathBuf>,

    /// Write output to FILE instead of standard output
    #[arg(short, long, value_name = "FILE", conflicts_with = "out_dir")]
    output: Option<PathBuf>,

    /// Write one output per input into DIR (required for several inputs)
    #[arg(short = 'd', long, value_name = "DIR")]
    out_dir: Option<PathBuf>,

    /// Input format
    #[arg(short, long, value_enum, default_value_t = From::Auto)]
    from: From,

    /// Output format
    #[arg(short, long, value_enum, default_value_t = To::Page)]
    to: To,

    /// Arrangement to render (defaults to the first)
    #[arg(short, long, value_name = "NAME")]
    arrangement: Option<String>,

    /// Page theme
    #[arg(long, value_enum)]
    theme: Option<Theme>,

    /// Document language (BCP 47)
    #[arg(long, value_name = "LANG")]
    lang: Option<String>,

    /// Show chord shapes for a capo on this fret (0-11)
    #[arg(long, value_name = "FRET", value_parser = clap::value_parser!(u8).range(0..=11))]
    capo: Option<u8>,

    /// Transpose the song by half steps (-11 to 11)
    #[arg(long, value_name = "STEPS", allow_hyphen_values = true, value_parser = clap::value_parser!(i8).range(-11..=11))]
    transpose: Option<i8>,

    /// Title override for imported formats without metadata
    #[arg(long)]
    title: Option<String>,

    /// Key override for imported formats without metadata
    #[arg(long)]
    key: Option<String>,

    /// Validate only: print diagnostics, write nothing, exit 1 on errors
    #[arg(long)]
    check: bool,

    /// Exit 1 when any error diagnostics are reported
    #[arg(long)]
    strict: bool,

    /// Only print error diagnostics
    #[arg(short, long)]
    quiet: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Request<'a> {
    source: &'a str,
    from: &'a str,
    to: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    arrangement: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    theme: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    capo: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    transpose: Option<i8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    key: Option<&'a str>,
}

#[derive(Deserialize, Debug)]
struct Response {
    ok: bool,
    #[serde(default)]
    output: String,
    #[serde(default)]
    diagnostics: Vec<Diagnostic>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Deserialize, Debug)]
struct Diagnostic {
    severity: String,
    #[serde(default)]
    code: String,
    message: String,
    #[serde(default)]
    line: Option<u64>,
}

/// QuickJS runtime with the song2html modules loaded.
struct Engine {
    _runtime: Runtime,
    context: Context,
}

impl Engine {
    fn new() -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|error| error.to_string())?;
        let mut resolver = BuiltinResolver::default();
        let mut loader = BuiltinLoader::default();
        for (name, source) in MODULES {
            resolver.add_module(*name);
            loader.add_module(*name, *source);
        }
        runtime.set_loader(resolver, loader);
        let context = Context::full(&runtime).map_err(|error| error.to_string())?;
        context.with(|ctx| {
            Module::evaluate(ctx.clone(), "src/main.js", BOOTSTRAP)
                .and_then(|promise| promise.finish::<()>())
                .catch(&ctx)
                .map_err(|error| format!("failed to load song2html engine: {error}"))
        })?;
        Ok(Self { _runtime: runtime, context })
    }

    fn convert(&self, request: &Request) -> Result<Response, String> {
        let json = serde_json::to_string(request).map_err(|error| error.to_string())?;
        let reply: String = self.context.with(|ctx| {
            let convert: Function = ctx.globals().get("__s2hConvert").catch(&ctx).map_err(|error| error.to_string())?;
            convert.call((json,)).catch(&ctx).map_err(|error| error.to_string())
        })?;
        serde_json::from_str(&reply).map_err(|error| error.to_string())
    }
}

fn kebab<T: ValueEnum>(value: T) -> String {
    value.to_possible_value().expect("value enums have names").get_name().to_string()
}

fn extension(to: To) -> &'static str {
    match to {
        To::Page | To::Fragment => "html",
        To::Json | To::Ast => "json",
        To::Song2html => "txt",
        To::Arrangements => "list",
    }
}

fn read_input(path: Option<&Path>) -> io::Result<String> {
    match path {
        Some(path) if path != Path::new("-") => fs::read_to_string(path),
        _ => {
            let mut buffer = String::new();
            io::stdin().read_to_string(&mut buffer)?;
            Ok(buffer)
        }
    }
}

fn report(label: &str, diagnostics: &[Diagnostic], quiet: bool) {
    let stderr = io::stderr();
    let mut stderr = stderr.lock();
    for diagnostic in diagnostics {
        if quiet && diagnostic.severity != "error" {
            continue;
        }
        let place = diagnostic.line.map(|line| format!("{label}:{line}")).unwrap_or_else(|| label.to_string());
        let _ = writeln!(stderr, "{place}: {}: {} [{}]", diagnostic.severity, diagnostic.message, diagnostic.code);
    }
}

fn run(cli: Cli) -> Result<bool, String> {
    let inputs: Vec<Option<PathBuf>> = if cli.inputs.is_empty() { vec![None] } else { cli.inputs.iter().cloned().map(Some).collect() };
    if inputs.len() > 1 && cli.out_dir.is_none() && !cli.check {
        return Err("several inputs need --out-dir (or --check)".into());
    }
    if let Some(dir) = &cli.out_dir {
        fs::create_dir_all(dir).map_err(|error| format!("{}: {error}", dir.display()))?;
    }
    let engine = Engine::new()?;
    let (from, to) = (kebab(cli.from), kebab(cli.to));
    let theme = cli.theme.map(kebab);
    let mut clean = true;

    for input in &inputs {
        let label = input.as_ref().map(|path| path.display().to_string()).unwrap_or_else(|| "<stdin>".into());
        let source = read_input(input.as_deref()).map_err(|error| format!("{label}: {error}"))?;
        let source_name = input.as_ref().and_then(|path| path.file_name()).and_then(|name| name.to_str());
        let response = engine.convert(&Request {
            source: &source,
            from: &from,
            to: &to,
            arrangement: cli.arrangement.as_deref(),
            theme: theme.as_deref(),
            language: cli.lang.as_deref(),
            capo: cli.capo,
            transpose: cli.transpose,
            source_name,
            title: cli.title.as_deref(),
            key: cli.key.as_deref(),
        })?;
        if !response.ok {
            return Err(format!("{label}: {}", response.error.unwrap_or_else(|| "conversion failed".into())));
        }
        report(&label, &response.diagnostics, cli.quiet);
        let has_errors = response.diagnostics.iter().any(|diagnostic| diagnostic.severity == "error");
        clean &= !has_errors;
        if cli.check {
            continue;
        }
        if response.output.is_empty() && has_errors {
            continue;
        }
        if let Some(dir) = &cli.out_dir {
            let stem = input.as_ref().and_then(|path| path.file_stem()).and_then(|stem| stem.to_str()).unwrap_or("song");
            let target = dir.join(format!("{stem}.{}", extension(cli.to)));
            fs::write(&target, &response.output).map_err(|error| format!("{}: {error}", target.display()))?;
        } else if let Some(path) = &cli.output {
            fs::write(path, &response.output).map_err(|error| format!("{}: {error}", path.display()))?;
        } else {
            io::stdout().write_all(response.output.as_bytes()).map_err(|error| error.to_string())?;
        }
    }
    Ok(clean || !(cli.check || cli.strict))
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(1),
        Err(message) => {
            eprintln!("song2html: {message}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SONG: &str = "Amazing Grace [G]\n  verse: 1 4 1 5\n\nSections:\n  Verse 1:\n    A^mazing ^grace how ^sweet the ^sound\n";

    fn request<'a>(source: &'a str, to: &'a str) -> Request<'a> {
        Request { source, from: "auto", to, arrangement: None, theme: None, language: None, capo: None, transpose: None, source_name: None, title: None, key: None }
    }

    #[test]
    fn renders_a_standalone_page() {
        let engine = Engine::new().unwrap();
        let response = engine.convert(&request(SONG, "page")).unwrap();
        assert!(response.ok);
        assert!(response.output.starts_with("<!DOCTYPE html>"));
        assert!(response.output.contains("<sup class=\"s2h-chord\">C</sup>"));
    }

    #[test]
    fn applies_capo_and_transpose() {
        let engine = Engine::new().unwrap();
        let capo = engine.convert(&Request { capo: Some(2), ..request(SONG, "fragment") }).unwrap();
        assert!(capo.output.contains("(F shapes)"), "{}", capo.output);
        assert!(capo.output.contains("<sup class=\"s2h-chord\">Bb</sup>"));
        let moved = engine.convert(&Request { transpose: Some(3), ..request(SONG, "song2html") }).unwrap();
        assert!(moved.output.starts_with("Amazing Grace [Bb]"), "{}", moved.output);
    }

    #[test]
    fn imports_chordpro() {
        let engine = Engine::new().unwrap();
        let source = "{title: Test}\n{key: D}\n{start_of_chorus}\n[D]Sing [G]out\n{end_of_chorus}\n";
        let response = engine.convert(&request(source, "song2html")).unwrap();
        assert!(response.output.contains("chorus: D G"), "{}", response.output);
    }

    #[test]
    fn reports_engine_errors_without_panicking() {
        let engine = Engine::new().unwrap();
        let response = engine.convert(&request("x", "nonsense")).unwrap();
        assert!(!response.ok);
        assert!(response.error.unwrap().contains("Unknown output format"));
    }
}
