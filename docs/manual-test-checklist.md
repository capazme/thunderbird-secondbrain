# Manual E2E checklist

Run before each release, on a real account. Prerequisites: Thunderbird >= 128,
Ollama running with `OLLAMA_ORIGINS="moz-extension://*"` and gemma3 installed.

## Happy paths
- [ ] Thread with 2 messages: summary has the required sections, in Italian
- [ ] Thread with ~10 messages: summary cites the actual topics; meta line
      shows the message count and model
- [ ] Long thread (30+): truncation note appears; still useful
- [ ] HTML-only message in thread: text extracted, no tags in summary
- [ ] English thread: summary still in Italian
- [ ] Reopen same thread: instant result, meta shows "dalla cache"
- [ ] Rigenera: bypasses cache, new generation starts
- [ ] Copia: clipboard contains the summary markdown

## Robustness
- [ ] Close popup mid-generation, reopen: stream resumes, no restart
- [ ] Annulla mid-generation: cancelled state, Rigenera works
- [ ] Quit Ollama → summarize: "Ollama non è in esecuzione" + Riprova works
- [ ] Unset OLLAMA_ORIGINS (launchctl unsetenv OLLAMA_ORIGINS, restart
      Ollama) → summarize: 403 view with the copyable command
- [ ] Select a non-installed model in options → summarize: model_missing view
- [ ] Message with no thread: works on the single message
- [ ] Feed/standalone tab with no displayed message: "Nessun messaggio" view

## Environment
- [ ] Fresh profile install from .xpi: button appears, options open
- [ ] Only network traffic: localhost:11434 (check Ollama logs / no other
      requests from the extension in the Network panel of the background page)

## Vault (Second Brain, since 0.2.0)
Prerequisites: Obsidian open, Local REST API enabled on 27123, API key saved
in the options, *Testa connessione* green.
- [ ] Mail from a known client domain: «Salva» proposes the client; matters listed
- [ ] Save with client + matter: note, attachment(s), «Cronologia» line, `vault` tag
- [ ] Save the same mail again: «Già nel vault» with the note path, nothing rewritten
- [ ] Mail on a PEC account: `.eml` checkbox forced on; `.eml` written, SHA-256 shown
- [ ] Destination «Personale» and «Inbox»: note lands in the configured folders
- [ ] Two mails with the same sender/subject/day: second note gets « (2)»
- [ ] Promessa: note created under `Promesse/` with `prossima_scadenza`; appears
      in the calendar after the projector runs
- [ ] Scadenza: `prossima_scadenza` updated only when earlier; line under «⏰ Scadenze»
- [ ] Obsidian closed → «Salva»: clear "non raggiungibile" message, Riprova works
- [ ] Wrong API key → 401 message pointing to the options
- [ ] Riassunto tab: identical behaviour to 0.1.3 (cache, cancel, regenerate)
