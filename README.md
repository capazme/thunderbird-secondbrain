# Thunderbird Second Brain

[![CI](https://github.com/capazme/thunderbird-secondbrain/actions/workflows/ci.yml/badge.svg)](https://github.com/capazme/thunderbird-secondbrain/actions/workflows/ci.yml)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://www.mozilla.org/en-US/MPL/2.0/)
[![Thunderbird ≥128](https://img.shields.io/badge/Thunderbird-%E2%89%A5128-0a84ff.svg)](https://www.thunderbird.net/)

A Thunderbird add-on that connects your mailbox to an **Obsidian** vault and to
a **local** Ollama model. One button on the message header, three tabs:

- **Salva** — saves the displayed message into the right place of the vault:
  a verbatim Markdown note with a complete frontmatter, the attachments as
  files, and (for PEC accounts, or on request) the original `.eml` with its
  SHA-256 fingerprint. The sender is matched to a client card, a line is
  appended to the matter's «Cronologia», and the message is tagged `vault` in
  Thunderbird. Saving the same message twice is detected by Message-ID.
- **Riassunto** — the original thread summarizer: a structured triage summary
  (TL;DR, key points, actions & deadlines, who is waiting for a reply) produced
  by a local Ollama model, streamed into the panel and cached per thread.
- **Promessa** — turns a mail into a «Promessa» note (with a due date that the
  vault's calendar projector picks up) or registers a deadline on the matter.

**No email content ever leaves your machine.** The only hosts the extension
contacts are `localhost:27123` (Obsidian Local REST API) and
`localhost:11434` (Ollama). No cloud, no telemetry, no bundled runtime
dependencies. The AI is optional and downstream: nothing it produces is ever
written into a matter by itself.

> Formerly *Thread Summarizer (Ollama) for Thunderbird* (`tb-thread-summarizer`).
> The add-on id is unchanged, so 0.1.x installs update in place.

## Requirements

- **Thunderbird ≥ 128**
- **Obsidian** with the community plugin **Local REST API** enabled
  (non-encrypted HTTP server on port 27123). Copy its API key into the add-on
  options and press *Testa connessione*.
- Optional, for summaries: [**Ollama**](https://ollama.com) running locally
  with at least one chat model installed, e.g. `ollama pull granite4`

## What gets written in the vault

Folders are configurable in the options (defaults in brackets).

| Destination | Note | Attachments | `.eml` |
|---|---|---|---|
| Client *(cartella `📁 Clienti/<cliente>`)* | `Corrispondenza/<data> — <mittente> — <oggetto>.md` | `Allegati/<data> — <nome>` | `Allegati/eml/<message-id>.eml` |
| Personal *(`🌱 Personale/Corrispondenza`)* | `<data> — <mittente> — <oggetto>.md` | `Allegati/…` | `Allegati/eml/…` |
| Inbox *(`📥 Inbox`)* | same | `Allegati/…` | `Allegati/eml/…` |

Client cards are read from `📁 Clienti/<cartella>/<cartella> — scheda cliente.md`
(`nome`, `domini`, `email` in the frontmatter); matters from
`📁 Clienti/<cartella>/Pratiche/*.md`. Promises go to
`📁 Clienti/<cartella>/Promesse/` (or `🌱 Personale/Promesse/`), deadlines
update `prossima_scadenza` on the matter and add a line under «⏰ Scadenze».

The note frontmatter is fully quoted (`tipo: "corrispondenza"`, `message_id`,
`thread_key`, `da`, `a`, `cc`, `data`, `oggetto`, `cliente`, `pratica`,
`allegati`, `eml`, `raw_sha256`, `account`, `pec`, `anima`, `tags`) and the
body ends with an empty «🤖 Proposte» section reserved for AI suggestions.

## One-time Ollama setup

Ollama rejects requests coming from browser extensions unless their origin is
allowed. Configure it once, **then restart Ollama** so it picks up the change.

**macOS**

```bash
launchctl setenv OLLAMA_ORIGINS "moz-extension://*"
```

Then quit Ollama from the menu-bar icon and reopen it.

> **Make it survive reboots.** `launchctl setenv` is reset every time you
> restart your Mac. To set it permanently, run once (installs a per-user
> LaunchAgent; the script prints how to undo it):
>
> ```bash
> bash scripts/persist-ollama-origins-macos.sh
> ```

**Linux** (systemd): add to the service via `systemctl edit ollama.service`

```ini
[Service]
Environment="OLLAMA_ORIGINS=moz-extension://*"
```

then `sudo systemctl daemon-reload && sudo systemctl restart ollama`.

**Windows**: set a system environment variable `OLLAMA_ORIGINS` to
`moz-extension://*`, then restart Ollama.

> If you skip this step the panel shows a clear message with the exact command
> to run.

## Install

**From a release (recommended)**

1. Download the latest `thunderbird-secondbrain-<version>.xpi` from the
   [Releases](https://github.com/capazme/thunderbird-secondbrain/releases) page.
2. Thunderbird → **Add-ons Manager** → gear icon → **Install Add-on From
   File…** → pick the `.xpi`.

**From source**

```bash
git clone https://github.com/capazme/thunderbird-secondbrain.git
cd thunderbird-secondbrain
npm install && npm test
npm run package   # produces dist/thunderbird-secondbrain-<version>.xpi
```

## Usage

Open any message → click **Riassumi thread** in the message-header toolbar. The
first summary of a thread streams in; reopening the same thread is instant
(session cache). Use **Rigenera** to force a fresh summary, **Copia** to copy
the text, and the gear icon to open options.

## How it works

1. The thread of the displayed message is reconstructed from the
   `References` / `In-Reply-To` headers, with a normalized-subject fallback.
2. Each message is reduced to clean text (quotes and signatures stripped) and
   assembled into a single chronological transcript, trimmed to a context
   budget.
3. The transcript is sent to Ollama's `/api/chat` with a fixed triage prompt;
   the response streams back into the panel.
4. Generation runs in the background page, so closing the popup does not
   cancel it; the finished summary is cached for the session.

## Development

- `npm install` — dev tooling only (Vitest; the extension itself has zero
  runtime dependencies and no build step)
- `npm test` — 47 unit tests over the pure logic modules
- Load for development: **Tools → Developer Tools → Debug Add-ons → Load
  Temporary Add-on…** → select `manifest.json`
- Manual end-to-end checklist: [`docs/manual-test-checklist.md`](docs/manual-test-checklist.md)

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Privacy

Email content is sent exclusively to the configured Ollama endpoint. Summaries
are held in extension session storage and cleared when Thunderbird quits.
Settings contain no personal data. The extension requests only `messagesRead`,
`storage`, and host access to `localhost`/`127.0.0.1:11434`.

## License

[Mozilla Public License 2.0](LICENSE) © capazme
