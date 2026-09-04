import { buildThread } from './lib/thread-builder.js';
import { extractMessageText, renderMessage } from './lib/content-extractor.js';
import { buildChatMessages } from './lib/prompt.js';
import { createOllamaClient, OllamaError } from './lib/ollama-client.js';
import { threadKey, createSummaryManager } from './lib/summary-manager.js';
import { getSettings, pickDefaultModel } from './lib/settings.js';
import { createVaultClient, VaultError } from './lib/vault-client.js';
import { caricaClienti, pratiche, abbina, emailDi } from './lib/anagrafica.js';
import { salvaMessaggio } from './lib/salva.js';
import { creaPromessa, creaScadenza } from './lib/promesse.js';

const HOST_ORIGINS = ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'];
const OBSIDIAN_ORIGINS = ['http://localhost:27123/*', 'http://127.0.0.1:27123/*'];
const manager = createSummaryManager({ storage: messenger.storage.session });

// ---------------------------------------------------------------------------
// Riassunto del thread (porta «summary»): invariato rispetto a tb-thread-summarizer
// ---------------------------------------------------------------------------
messenger.runtime.onConnect.addListener((port) => {
  if (port.name !== 'summary') return;
  let attachedJob = null;
  const listener = (event) => {
    try {
      port.postMessage(event);
    } catch {
      // port already closed; detach happens in onDisconnect
    }
  };

  port.onMessage.addListener(async (msg) => {
    try {
      if (msg.command === 'summarize') {
        attachedJob = await handleSummarize(msg, listener, attachedJob);
      } else if (msg.command === 'cancel') {
        attachedJob?.abortController.abort();
      }
    } catch (err) {
      listener(toErrorEvent(err));
      attachedJob = null;
    }
  });

  port.onDisconnect.addListener(() => {
    if (attachedJob) manager.detach(attachedJob, listener);
  });
});

async function displayedHeader(tabId) {
  const displayed = await messenger.messageDisplay.getDisplayedMessages(tabId);
  return (displayed.messages ?? displayed)[0] ?? null;
}

async function handleSummarize({ tabId, force }, listener, previousJob) {
  if (previousJob) manager.detach(previousJob, listener);

  const header = await displayedHeader(tabId);
  if (!header) {
    listener({ type: 'error', code: 'no_message', detail: 'no displayed message in this tab' });
    return null;
  }

  // Gecko MV3 may treat host permissions as user-grantable, not install-time.
  const granted = await messenger.permissions.contains({ origins: HOST_ORIGINS });
  if (!granted) {
    listener({ type: 'error', code: 'permission', detail: 'host permission not granted' });
    return null;
  }

  const settings = await getSettings(messenger.storage.local);
  listener({ type: 'phase', phase: 'building' });
  const { messages: thread, totalFound } = await buildThread(messenger, header, {
    maxMessages: settings.maxMessages,
  });
  const key = threadKey(thread.map((h) => h.headerMessageId));

  const existing = manager.getJob(key);
  if (existing) {
    manager.attach(existing, listener);
    return existing;
  }

  if (!force) {
    const cached = await manager.getCached(key);
    if (cached?.summary) {
      listener({ type: 'done', summary: cached.summary, meta: { ...cached.meta, cached: true } });
      return null;
    }
    if (cached?.status === 'interrupted') {
      listener({ type: 'interrupted', partial: cached.partial });
      return null;
    }
  }

  const raced = manager.getJob(key);
  if (raced) {
    manager.attach(raced, listener);
    return raced;
  }

  const job = manager.createJob(key);
  manager.attach(job, listener);
  runGeneration(job, thread, totalFound, settings); // errors handled inside
  return job;
}

async function runGeneration(job, thread, totalFound, settings) {
  let pendingSave = Promise.resolve();
  try {
    const client = createOllamaClient({ endpoint: settings.endpointUrl });
    let model = settings.model;
    if (!model) model = pickDefaultModel(await client.listModels());
    if (!model) throw new OllamaError('model_missing', 'no models installed');

    const rendered = [];
    for (let i = 0; i < thread.length; i++) {
      const h = thread[i];
      const full = await messenger.messages.getFull(h.id);
      rendered.push(renderMessage(i + 1, thread.length, h.author, formatDate(h.date), extractMessageText(full)));
    }
    const { messages, truncatedCount, usedCount } = buildChatMessages(rendered);

    manager.emit(job, { type: 'phase', phase: 'generating', messageCount: usedCount, totalFound });

    let lastSave = 0;
    const summary = await client.chatStream({
      model,
      messages,
      signal: job.abortController.signal,
      onChunk: (piece) => {
        manager.emit(job, { type: 'chunk', text: piece });
        // Throttled partial save so an event-page suspension loses at most ~2s.
        const now = Date.now();
        if (now - lastSave > 2000) {
          lastSave = now;
          pendingSave = manager
            .setCached(job.key, { status: 'interrupted', partial: job.partial, savedAt: new Date().toISOString() })
            .catch(() => {});
        }
      },
    });

    const meta = {
      usedCount,
      totalFound,
      truncatedCount,
      model,
      cached: false,
      generatedAt: new Date().toISOString(),
    };
    await pendingSave;
    await manager.setCached(job.key, { summary, meta, savedAt: meta.generatedAt });
    manager.emit(job, { type: 'done', summary, meta });
  } catch (err) {
    if (err instanceof OllamaError && err.code === 'cancelled') {
      await pendingSave;
      manager.clearCached(job.key).catch(() => {});
      manager.emit(job, { type: 'cancelled' });
    } else {
      await pendingSave;
      manager.clearCached(job.key).catch(() => {});
      manager.emit(job, toErrorEvent(err));
    }
  } finally {
    manager.finish(job);
  }
}

function toErrorEvent(err) {
  if (err instanceof OllamaError) return { type: 'error', code: err.code, detail: err.detail };
  return { type: 'error', code: 'unknown', detail: String(err) };
}

function formatDate(date) {
  const d = new Date(date);
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

// ---------------------------------------------------------------------------
// Vault Obsidian: salvataggio, promesse, scadenze (messaggi «tipo» dal popup)
// ---------------------------------------------------------------------------
messenger.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.tipo !== 'string') return undefined;
  return rispondi(() => gestisci(msg));
});

async function rispondi(fn) {
  try {
    return { ok: true, dati: await fn() };
  } catch (err) {
    return { ok: false, errore: descriviErrore(err) };
  }
}

function descriviErrore(err) {
  if (err instanceof VaultError) {
    if (err.status === 401) return { codice: 'vault_auth', testo: 'Obsidian rifiuta la chiave API (401): controlla le opzioni.' };
    if (err.status === 404) return { codice: 'vault_404', testo: `Percorso non trovato nel vault (404): ${err.detail || ''}`.trim() };
    return { codice: 'vault', testo: `Obsidian REST ${err.status}: ${err.detail || ''}`.trim() };
  }
  if (err instanceof TypeError) return { codice: 'vault_offline', testo: 'Obsidian non raggiungibile: aprilo e verifica che il plugin Local REST API sia attivo (porta 27123).' };
  return { codice: 'generico', testo: err?.message ?? String(err) };
}

function creaVault(settings) {
  return createVaultClient({ baseUrl: settings.obsidianUrl, apiKey: settings.obsidianApiKey });
}

function riassumiHeader(h) {
  return { id: h.id, headerMessageId: h.headerMessageId, subject: h.subject, author: h.author, date: new Date(h.date).toISOString(), accountId: h.folder?.accountId ?? '' };
}

async function nomeAccount(header) {
  const id = header?.folder?.accountId;
  if (!id) return { id: '', name: '' };
  try {
    const a = await messenger.accounts.get(id, false);
    return { id: a.id, name: a.name, type: a.type };
  } catch {
    return { id, name: id };
  }
}

async function nomeNotaDi(vault, header) {
  const trovati = await vault.searchSimple(header.headerMessageId);
  const nota = (trovati ?? []).find((r) => typeof r.filename === 'string' && r.filename.endsWith('.md'));
  return nota ? nota.filename.slice(nota.filename.lastIndexOf('/') + 1, -3) : '';
}

async function gestisci(msg) {
  const settings = await getSettings(messenger.storage.local);
  switch (msg.tipo) {
    case 'stato': {
      const header = await displayedHeader(msg.tabId);
      const permessi = {
        ollama: await messenger.permissions.contains({ origins: HOST_ORIGINS }),
        obsidian: await messenger.permissions.contains({ origins: OBSIDIAN_ORIGINS }),
      };
      const account = await nomeAccount(header);
      const pec = !!account.id && (settings.pecAccountIds ?? []).includes(account.id);
      let clienti = [];
      let suggerimento = null;
      let giaSalvato = '';
      let vaultErrore = null;
      if (permessi.obsidian && settings.obsidianApiKey) {
        try {
          const vault = creaVault(settings);
          clienti = await caricaClienti(vault, settings.clientsFolder);
          if (header) {
            suggerimento = abbina(emailDi(header.author), clienti);
            giaSalvato = await nomeNotaDi(vault, header);
          }
        } catch (err) {
          vaultErrore = descriviErrore(err);
        }
      } else if (!settings.obsidianApiKey) {
        vaultErrore = { codice: 'vault_config', testo: 'Manca la chiave API di Obsidian: impostala nelle opzioni.' };
      }
      return { header: header && riassumiHeader(header), account, pec, permessi, clienti, suggerimento, giaSalvato, vaultErrore };
    }
    case 'pratiche':
      return pratiche(creaVault(settings), settings.clientsFolder, msg.cliente);
    case 'salva': {
      const header = await displayedHeader(msg.tabId);
      if (!header) throw new Error('Nessun messaggio visualizzato.');
      const account = await nomeAccount(header);
      let chiave = '';
      try {
        const { messages: thread } = await buildThread(messenger, header, { maxMessages: settings.maxMessages });
        chiave = threadKey(thread.map((h) => h.headerMessageId));
      } catch {
        chiave = threadKey([header.headerMessageId]);
      }
      const esito = await salvaMessaggio({
        messenger, vault: creaVault(settings), settings, header, scelta: msg.scelta,
        estraiTesto: (full) => extractMessageText(full), account: account.name, threadKey: chiave,
      });
      return { ...esito, notaNome: esito.nota.slice(esito.nota.lastIndexOf('/') + 1, -3) };
    }
    case 'promessa': {
      const header = await displayedHeader(msg.tabId);
      const vault = creaVault(settings);
      const notaNome = header ? await nomeNotaDi(vault, header) : '';
      return creaPromessa({ vault, settings, scelta: msg.scelta, dati: msg.dati, notaNome, oggi: new Date().toISOString().slice(0, 10) });
    }
    case 'scadenza': {
      const header = await displayedHeader(msg.tabId);
      const vault = creaVault(settings);
      const notaNome = header ? await nomeNotaDi(vault, header) : '';
      return creaScadenza({ vault, settings, scelta: msg.scelta, dati: msg.dati, notaNome });
    }
    default:
      throw new Error(`Richiesta sconosciuta: ${msg.tipo}`);
  }
}
