import { renderTriage, escapeHtml } from '../lib/markdown-lite.js';

const HOST_ORIGINS = ['http://localhost:11434/*', 'http://127.0.0.1:11434/*'];
const OBSIDIAN_ORIGINS = ['http://localhost:27123/*', 'http://127.0.0.1:27123/*'];
const OLLAMA_ORIGINS_CMD = 'launchctl setenv OLLAMA_ORIGINS "moz-extension://*"';

const $ = (id) => document.getElementById(id);
const root = $('root');
const btnCancel = $('btn-cancel');
const btnCopy = $('btn-copy');
const btnRegen = $('btn-regen');

let port = null;
let currentTabId = null;
let currentText = '';
let riassuntoAvviato = false;
let stato = null;

document.getElementById('btn-options').addEventListener('click', () => messenger.runtime.openOptionsPage());
btnCancel.addEventListener('click', () => port?.postMessage({ command: 'cancel' }));
btnCopy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(currentText);
  btnCopy.textContent = 'Copiato ✓';
  setTimeout(() => (btnCopy.textContent = 'Copia'), 1500);
});
btnRegen.addEventListener('click', () => summarize(true));
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => mostraScheda(b.dataset.tab, true));

init();

async function init() {
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;
  const ui = (await messenger.storage.local.get('ui')).ui ?? {};
  mostraScheda(ui.lastTab ?? 'salva', false);
  await caricaStato();
}

function mostraScheda(nome, ricorda) {
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === nome);
  for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== `tab-${nome}`;
  $('footer-riassunto').hidden = nome !== 'riassunto';
  if (nome === 'riassunto' && !riassuntoAvviato) {
    riassuntoAvviato = true;
    port = messenger.runtime.connect({ name: 'summary' });
    port.onMessage.addListener(onEvent);
    summarize(false);
  }
  if (nome === 'promessa') aggiornaDestinazionePromessa();
  if (ricorda) messenger.storage.local.set({ ui: { lastTab: nome } }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Scheda «Salva»
// ---------------------------------------------------------------------------
async function invia(msg) {
  const r = await messenger.runtime.sendMessage(msg);
  if (!r?.ok) throw Object.assign(new Error(r?.errore?.testo ?? 'Errore sconosciuto'), { codice: r?.errore?.codice });
  return r.dati;
}

async function caricaStato() {
  $('msg-info').textContent = 'Lettura del messaggio…';
  try {
    stato = await invia({ tipo: 'stato', tabId: currentTabId });
  } catch (err) {
    mostraAvviso(`<strong>Errore</strong><p>${escapeHtml(err.message)}</p>`);
    return;
  }
  renderSalva();
}

function renderSalva() {
  const h = stato.header;
  $('msg-info').innerHTML = h
    ? `<span class="subject">${escapeHtml(h.subject || '(senza oggetto)')}</span>${escapeHtml(h.author)} · ${escapeHtml(h.date.slice(0, 10))}${stato.account?.name ? ` · ${escapeHtml(stato.account.name)}` : ''}${stato.pec ? ' · <strong>PEC</strong>' : ''}`
    : 'Nessun messaggio visualizzato: apri una mail e riprova.';
  $('form-salva').hidden = !h;

  if (!stato.permessi.obsidian) {
    mostraAvviso('<strong>Serve il permesso per parlare con Obsidian</strong><p>Concedi l’accesso a <code>localhost:27123</code> (resta tutto sul tuo computer).</p>', {
      label: 'Concedi accesso',
      run: async () => {
        const ok = await messenger.permissions.request({ origins: OBSIDIAN_ORIGINS });
        if (ok) caricaStato();
      },
    });
    return;
  }
  if (stato.vaultErrore) {
    const cfg = stato.vaultErrore.codice === 'vault_config' || stato.vaultErrore.codice === 'vault_auth';
    mostraAvviso(`<strong>Vault non disponibile</strong><p>${escapeHtml(stato.vaultErrore.testo)}</p>`, cfg
      ? { label: 'Apri opzioni', run: () => messenger.runtime.openOptionsPage() }
      : { label: 'Riprova', run: () => caricaStato() });
    return;
  }
  $('vault-warn').hidden = true;

  const sel = $('sel-cliente');
  sel.innerHTML = '';
  for (const c of stato.clienti) {
    const o = document.createElement('option');
    o.value = c.cartella;
    o.textContent = c.nome === c.cartella ? c.nome : `${c.nome} (${c.cartella})`;
    sel.appendChild(o);
  }
  const sug = stato.suggerimento;
  if (sug?.cliente) {
    sel.value = sug.cliente;
    $('suggerimento').textContent = `Suggerito «${sug.cliente}» (${sug.fonte === 'email' ? 'indirizzo noto' : 'dominio'}).`;
  } else if (sug?.candidati?.length) {
    $('suggerimento').textContent = `Più clienti possibili: ${sug.candidati.join(', ')}.`;
  } else {
    $('suggerimento').textContent = stato.clienti.length ? 'Nessun cliente abbinato al mittente: scegli tu.' : 'Nessuna scheda cliente nel vault.';
    if (!stato.clienti.length) document.querySelector('input[name=dest][value=inbox]').checked = true;
  }
  $('chk-eml').checked = stato.pec;
  $('chk-eml').disabled = stato.pec;
  aggiornaDestinazione();
  caricaPratiche();

  if (stato.giaSalvato) {
    $('esito-salva').innerHTML = `<div class="esito"><span class="warn">Già nel vault:</span> <code>${escapeHtml(stato.giaSalvato)}</code></div>`;
    $('btn-salva').disabled = true;
  } else {
    $('esito-salva').innerHTML = '';
    $('btn-salva').disabled = false;
  }
}

function mostraAvviso(html, azione) {
  const box = $('vault-warn');
  box.innerHTML = html;
  box.hidden = false;
  if (azione) {
    const btn = document.createElement('button');
    btn.className = 'action';
    btn.textContent = azione.label;
    btn.addEventListener('click', azione.run);
    box.appendChild(btn);
  }
}

function destinazione() {
  return document.querySelector('input[name=dest]:checked')?.value ?? 'inbox';
}

function sceltaCorrente() {
  const dest = destinazione();
  return {
    destinazione: dest,
    cliente: dest === 'cliente' ? $('sel-cliente').value : '',
    pratica: dest === 'cliente' ? $('sel-pratica').value : '',
    salvaEml: $('chk-eml').checked,
  };
}

function aggiornaDestinazione() {
  $('blocco-cliente').hidden = destinazione() !== 'cliente';
  aggiornaDestinazionePromessa();
}
for (const r of document.querySelectorAll('input[name=dest]')) r.addEventListener('change', aggiornaDestinazione);
$('sel-cliente').addEventListener('change', () => { caricaPratiche(); aggiornaDestinazionePromessa(); });
$('sel-pratica').addEventListener('change', aggiornaDestinazionePromessa);

async function caricaPratiche() {
  const cliente = $('sel-cliente').value;
  const sel = $('sel-pratica');
  for (const o of [...sel.options].slice(1)) o.remove();
  if (!cliente) return;
  try {
    for (const p of await invia({ tipo: 'pratiche', cliente })) {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p.replace(/^Pratica — /, '');
      sel.appendChild(o);
    }
  } catch (err) {
    $('suggerimento').textContent = `Pratiche non lette: ${err.message}`;
  }
}

$('btn-salva').addEventListener('click', async () => {
  const btn = $('btn-salva');
  btn.disabled = true;
  btn.textContent = 'Salvataggio…';
  try {
    const r = await invia({ tipo: 'salva', tabId: currentTabId, scelta: sceltaCorrente() });
    const righe = [`Nota: <code>${escapeHtml(r.nota)}</code>`];
    for (const a of r.allegati) righe.push(`Allegato: <code>${escapeHtml(a)}</code>`);
    if (r.eml) righe.push(`Originale: <code>${escapeHtml(r.eml)}</code><br>SHA-256 <code>${escapeHtml(r.sha256)}</code>`);
    if (r.cronologia) righe.push('Riga aggiunta alla cronologia.');
    for (const a of r.avvisi ?? []) righe.push(`<span class="warn">${escapeHtml(a)}</span>`);
    $('esito-salva').innerHTML = `<div class="esito"><span class="ok">${r.giaSalvato ? 'Era già nel vault' : 'Salvato ✓'}</span><ul>${righe.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
    stato.giaSalvato = r.nota;
    btn.textContent = 'Salvato';
  } catch (err) {
    $('esito-salva').innerHTML = `<div class="esito"><span class="warn">Non salvato:</span> ${escapeHtml(err.message)}</div>`;
    btn.disabled = false;
    btn.textContent = 'Salva nel vault';
  }
});

// ---------------------------------------------------------------------------
// Scheda «Promessa»
// ---------------------------------------------------------------------------
function aggiornaDestinazionePromessa() {
  const s = sceltaCorrente();
  const dove = s.destinazione === 'cliente'
    ? `${s.cliente || '(scegli un cliente nella scheda Salva)'}${s.pratica ? ` · ${s.pratica.replace(/^Pratica — /, '')}` : ' · scheda cliente'}`
    : 'personale (calendario «personale»)';
  $('promessa-dest').textContent = `Destinazione: ${dove}`;
  $('btn-scadenza').disabled = s.destinazione !== 'cliente' || !s.cliente;
}

$('btn-promessa').addEventListener('click', async () => {
  const dati = { cosa: $('pr-cosa').value.trim(), aChi: $('pr-achi').value.trim(), entro: $('pr-entro').value };
  if (!dati.cosa || !dati.aChi || !dati.entro) return esitoPromessa('warn', 'Compila cosa, a chi ed entro quando.');
  const scelta = sceltaCorrente();
  if (scelta.destinazione === 'inbox') scelta.destinazione = 'personale';
  try {
    const r = await invia({ tipo: 'promessa', tabId: currentTabId, scelta, dati });
    esitoPromessa('ok', `Promessa creata: <code>${escapeHtml(r.nota)}</code>`);
    $('pr-cosa').value = ''; $('pr-achi').value = ''; $('pr-entro').value = '';
  } catch (err) {
    esitoPromessa('warn', `Promessa non creata: ${escapeHtml(err.message)}`);
  }
});

$('btn-scadenza').addEventListener('click', async () => {
  const dati = { cosa: $('sc-cosa').value.trim(), data: $('sc-data').value };
  if (!dati.cosa || !dati.data) return esitoPromessa('warn', 'Compila cosa scade e la data.');
  try {
    const r = await invia({ tipo: 'scadenza', tabId: currentTabId, scelta: sceltaCorrente(), dati });
    const extra = r.prossimaAggiornata ? ` · <code>prossima_scadenza</code> aggiornata${r.precedente ? ` (era ${escapeHtml(r.precedente)})` : ''}` : ' · resta la scadenza più vicina già presente';
    esitoPromessa('ok', `Scadenza registrata in <code>${escapeHtml(r.scheda)}</code>${extra}${(r.avvisi ?? []).map((a) => `<br><span class="warn">${escapeHtml(a)}</span>`).join('')}`);
    $('sc-cosa').value = ''; $('sc-data').value = '';
  } catch (err) {
    esitoPromessa('warn', `Scadenza non registrata: ${escapeHtml(err.message)}`);
  }
});

function esitoPromessa(cls, html) {
  $('esito-promessa').innerHTML = `<div class="esito"><span class="${cls}">${html}</span></div>`;
}

// ---------------------------------------------------------------------------
// Scheda «Riassunto»: codice del summarizer, invariato
// ---------------------------------------------------------------------------
function summarize(force) {
  currentText = '';
  setButtons({ cancel: false, copy: false, regen: false });
  renderPhase('Preparazione…');
  port.postMessage({ command: 'summarize', tabId: currentTabId, force });
}

function onEvent(event) {
  switch (event.type) {
    case 'phase':
      if (event.phase === 'building') renderPhase('Ricostruzione del thread…');
      else renderPhase(`Generazione… (${messageCountLabel(event.messageCount)})`);
      setButtons({ cancel: event.phase === 'generating', copy: false, regen: false });
      break;
    case 'chunk':
      currentText += event.text;
      root.innerHTML = renderTriage(currentText);
      root.scrollTop = root.scrollHeight;
      setButtons({ cancel: true, copy: false, regen: false });
      break;
    case 'done':
      currentText = event.summary;
      root.innerHTML = renderTriage(event.summary) + metaBar(event.meta);
      setButtons({ cancel: false, copy: true, regen: true });
      break;
    case 'interrupted':
      currentText = event.partial;
      root.innerHTML =
        '<p class="note">Generazione interrotta: riassunto parziale.</p>' + renderTriage(event.partial);
      setButtons({ cancel: false, copy: true, regen: true });
      break;
    case 'cancelled':
      root.innerHTML = '<p class="note">Generazione annullata.</p>';
      setButtons({ cancel: false, copy: false, regen: true });
      break;
    case 'error':
      renderError(event);
      break;
  }
}

function metaBar(meta) {
  const parts = [messageCountLabel(meta.usedCount), `modello ${meta.model}`];
  if (meta.truncatedCount > 0) parts.push(`thread troncato (esclusi ${meta.truncatedCount} più vecchi)`);
  if (meta.usedCount < meta.totalFound) parts.push(`trovati ${meta.totalFound} in totale`);
  if (meta.cached) parts.push('dalla cache');
  return `<div class="meta">${escapeHtml(parts.join(' · '))}</div>`;
}

function renderPhase(text) {
  root.innerHTML = `<div class="phase"><div class="spinner"></div><span>${escapeHtml(text)}</span></div>`;
}

function renderError({ code, detail }) {
  const views = {
    unreachable: {
      title: 'Ollama non risponde',
      body:
        '<p>Due possibili cause:</p>' +
        '<ul>' +
        '<li><strong>Ollama non è avviato</strong>: aprilo e riprova.</li>' +
        '<li><strong>È avviato ma non ha ancora il permesso per le estensioni</strong>: ' +
        'esegui una volta nel Terminale, poi <strong>riavvia Ollama</strong>.</li>' +
        '</ul>' +
        `<pre class="cmd">${escapeHtml(OLLAMA_ORIGINS_CMD)}</pre>`,
      action: { label: 'Riprova', run: () => summarize(false) },
    },
    cors: {
      title: 'Ollama rifiuta le richieste dalle estensioni (403)',
      body: `<p>Esegui una volta nel Terminale, poi riavvia Ollama:</p><pre class="cmd">${escapeHtml(OLLAMA_ORIGINS_CMD)}</pre>`,
      action: { label: 'Riprova', run: () => summarize(false) },
    },
    model_missing: {
      title: 'Modello non disponibile',
      body: '<p>Scaricalo con <code>ollama pull</code> oppure scegli un altro modello nelle opzioni.</p>',
      action: { label: 'Apri opzioni', run: () => messenger.runtime.openOptionsPage() },
    },
    permission: {
      title: 'Serve il permesso per contattare Ollama',
      body: '<p>Concedi l’accesso a <code>localhost:11434</code> (resta tutto sul tuo computer).</p>',
      action: {
        label: 'Concedi accesso',
        run: async () => {
          const ok = await messenger.permissions.request({ origins: HOST_ORIGINS });
          if (ok) summarize(false);
        },
      },
    },
    timeout: {
      title: 'Tempo scaduto (120 s)',
      body: '<p>Il modello è troppo lento su questo thread: riprova o scegli un modello più piccolo.</p>',
      action: { label: 'Riprova', run: () => summarize(false) },
    },
    no_message: {
      title: 'Nessun messaggio visualizzato',
      body: '<p>Apri un messaggio e riprova.</p>',
      action: null,
    },
  };
  const view = views[code] ?? {
    title: 'Errore imprevisto',
    body: `<p class="detail">${escapeHtml(detail ?? '')}</p>`,
    action: { label: 'Riprova', run: () => summarize(false) },
  };
  root.innerHTML = `<div class="error"><strong>${escapeHtml(view.title)}</strong>${view.body}</div>`;
  if (view.action) {
    const btn = document.createElement('button');
    btn.className = 'action';
    btn.textContent = view.action.label;
    btn.addEventListener('click', view.action.run);
    root.querySelector('.error').appendChild(btn);
  }
  setButtons({ cancel: false, copy: false, regen: false });
}

function setButtons({ cancel, copy, regen }) {
  btnCancel.hidden = !cancel;
  btnCopy.hidden = !copy;
  btnRegen.hidden = !regen;
}

function messageCountLabel(n) {
  return `${n} ${n === 1 ? 'messaggio' : 'messaggi'}`;
}
