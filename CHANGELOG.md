# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-04

The add-on becomes **Thunderbird Second Brain**: the thread summarizer is now
one of three tabs, next to saving mail into an Obsidian vault. Repository
renamed from `tb-thread-summarizer` to `thunderbird-secondbrain` (the add-on id
is unchanged, so existing installs update in place).

### Added
- **Salva** tab: saves the displayed message into the vault through the
  Obsidian Local REST API — a verbatim Markdown note with a fully quoted
  frontmatter (Message-ID, thread key, sender, recipients, date, subject,
  client, matter, attachments, `.eml` path, SHA-256, account, PEC flag), the
  real attachments as files, and the original `.eml` (always for PEC accounts,
  on request otherwise) with its SHA-256 fingerprint. A line is appended to the
  «Cronologia» section of the matter (or of the client card), and the message
  gets a `vault` tag in Thunderbird (created if missing).
- Client suggestion from the sender: exact address, then domain/subdomain,
  read from the client cards in the vault (`domini`, `email` frontmatter).
- Destinations: client (with optional matter), personal correspondence, vault
  inbox. Idempotent: a message already in the vault is detected by Message-ID.
- Inline parts referenced from the body (signature logos, embedded images:
  `contentId` or `Content-Disposition: inline`) are not saved as attachments;
  the popup reports how many were skipped.
- **Promessa** tab: creates a «Promessa» note (with `prossima_scadenza` and
  `calendario`, so the calendar projector picks it up) or registers a deadline
  on the matter (`prossima_scadenza` updated only when the new date is
  earlier, plus a line under «⏰ Scadenze»).
- Options: Obsidian URL and API key with a connection test, vault folders,
  Thunderbird tag name, per-account PEC flag.
- Pure, dependency-injected modules with unit tests: `vault-client`,
  `frontmatter`, `anagrafica`, `nota-corrispondenza`, `salva`, `promesse`.

### Changed
- Popup title «Second Brain»; the summary starts when its tab is opened (the
  last used tab is remembered). Summary code and protocol are unchanged.
- Default model preference: granite4, gemma3, llama3, qwen2.5 (qwen3 avoided).
- Permissions: `messagesUpdate`, `messagesTags`, `accountsRead` added; host
  permissions for `localhost:27123` / `127.0.0.1:27123` (Obsidian) added.

[0.2.0]: https://github.com/capazme/thunderbird-secondbrain/releases/tag/v0.2.0

## [0.1.3] - 2026-07-14

### Added
- **Automatic updates** for self-distributed installs. The manifest now
  declares `browser_specific_settings.gecko.update_url` pointing at
  `updates.json` in this repository, so Thunderbird checks for and installs new
  versions on its own (Thunderbird does not require add-on signing, so no
  signing step is involved). A GitHub Actions workflow regenerates
  `updates.json` on every published release.

> Upgrade note: this is the first version carrying the auto-update mechanism.
> Install 0.1.3 manually once; from here on, updates are automatic.

## [0.1.2] - 2026-07-14

### Fixed
- Italian singular/plural for the message count in the panel: it now shows
  "1 messaggio" instead of "1 messaggi" (and "N messaggi" for N > 1), in both
  the generation phase line and the summary meta line.

[0.1.2]: https://github.com/capazme/thunderbird-secondbrain/releases/tag/v0.1.2

## [0.1.1] - 2026-07-14

### Changed
- The "Ollama unreachable" error panel now explains both possible causes —
  Ollama not started, or started without extension permission — and shows the
  `OLLAMA_ORIGINS` command inline. A CORS rejection surfaces in the browser as
  a generic network error, so the two cases cannot be told apart at runtime;
  the message now covers both instead of asserting Ollama is down.

### Added
- `scripts/persist-ollama-origins-macos.sh`: installs a per-user LaunchAgent so
  `OLLAMA_ORIGINS` survives macOS reboots. Referenced from the README and the
  options page.

[0.1.1]: https://github.com/capazme/thunderbird-secondbrain/releases/tag/v0.1.1

## [0.1.0] - 2026-07-14

Initial release.

### Added
- Message-header button ("Riassumi thread") that summarizes the thread of the
  displayed message using a local Ollama model.
- Structured Italian triage output: summary, key points, actions & deadlines,
  and who is waiting for a reply.
- Streaming rendering in a popup panel; generation runs in the background and
  survives the popup being closed.
- Per-thread session cache (never written to disk); instant re-open of an
  already-summarized thread.
- Thread reconstruction via `References`/`In-Reply-To` headers plus a
  normalized-subject heuristic, with an explicit cap on message count.
- Options page: configurable endpoint, model picker populated from the models
  installed in Ollama, thread-size limit, and a connection test.
- Actionable error states for the known failure modes (Ollama unreachable,
  CORS / `OLLAMA_ORIGINS`, missing model, missing host permission, timeout).
- 47 unit tests covering the pure logic modules (thread building, content
  extraction, NDJSON streaming, prompt budgeting, error mapping, cache).

[0.1.0]: https://github.com/capazme/thunderbird-secondbrain/releases/tag/v0.1.0
