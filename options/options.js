import { getSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { createOllamaClient } from '../lib/ollama-client.js';
import { createVaultClient } from '../lib/vault-client.js';

const $ = (id) => document.getElementById(id);
const OBSIDIAN_ORIGINS = ['http://localhost:27123/*', 'http://127.0.0.1:27123/*'];

async function client() {
  return createOllamaClient({ endpoint: $('endpoint').value.trim() || 'http://localhost:11434' });
}

async function refreshModels(selected) {
  const select = $('model');
  for (const opt of [...select.options].slice(1)) opt.remove();
  try {
    const models = await (await client()).listModels();
    for (const name of models) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    }
  } catch {
    // endpoint down: keep the automatic option only
  }
  if (selected && ![...select.options].some((o) => o.value === selected)) {
    const opt = document.createElement('option');
    opt.value = selected;
    opt.textContent = `${selected} (non verificato)`;
    select.appendChild(opt);
  }
  select.value = selected;
}

async function renderAccounts(pecIds) {
  const box = $('accounts');
  box.innerHTML = '';
  let accounts = [];
  try {
    accounts = await messenger.accounts.list(false);
  } catch {
    box.textContent = 'Elenco account non disponibile.';
    return;
  }
  for (const a of accounts) {
    if (a.type === 'none') continue; // cartelle locali
    const label = document.createElement('label');
    label.className = 'chk';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = a.id;
    cb.checked = pecIds.includes(a.id);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(`${a.name} (${a.type})`));
    box.appendChild(label);
  }
}

async function load() {
  const settings = await getSettings(messenger.storage.local);
  $('obsidian-url').value = settings.obsidianUrl;
  $('obsidian-key').value = settings.obsidianApiKey;
  $('clients-folder').value = settings.clientsFolder;
  $('personal-folder').value = settings.personalFolder;
  $('promises-folder').value = settings.personalPromisesFolder;
  $('inbox-folder').value = settings.inboxFolder;
  $('tag-vault').value = settings.tagVault;
  $('endpoint').value = settings.endpointUrl;
  $('max-messages').value = settings.maxMessages;
  await renderAccounts(settings.pecAccountIds ?? []);
  await refreshModels(settings.model);
}

$('btn-refresh').addEventListener('click', () => refreshModels($('model').value));

$('btn-test').addEventListener('click', async () => {
  const status = $('status');
  status.textContent = '…';
  status.className = '';
  try {
    const v = await (await client()).version();
    status.textContent = `OK — Ollama ${v}`;
    status.className = 'ok';
  } catch (err) {
    status.textContent = err.code === 'cors' ? 'Rifiutato (403): vedi Setup Ollama qui sotto' : 'Non raggiungibile';
    status.className = 'err';
  }
});

$('btn-vault-test').addEventListener('click', async () => {
  const status = $('vault-status');
  status.textContent = '…';
  status.className = '';
  try {
    // La pagina opzioni è aperta da un clic: qui la richiesta di permesso è ammessa.
    const ok = await messenger.permissions.request({ origins: OBSIDIAN_ORIGINS });
    if (!ok) throw new Error('permesso negato');
    const vault = createVaultClient({ baseUrl: $('obsidian-url').value.trim() || DEFAULT_SETTINGS.obsidianUrl, apiKey: $('obsidian-key').value.trim() });
    const info = await vault.info();
    if (!info.authenticated) throw Object.assign(new Error('chiave rifiutata'), { status: 401 });
    const clienti = await vault.listFolder($('clients-folder').value.trim() || DEFAULT_SETTINGS.clientsFolder);
    status.textContent = `OK — Obsidian ${info.versions?.obsidian ?? ''} · ${clienti.folders.length} clienti`;
    status.className = 'ok';
  } catch (err) {
    status.textContent = err.status === 401 ? 'Chiave API rifiutata (401)' : err.status === 404 ? 'Connesso, ma la cartella clienti non esiste (404)' : `Non raggiungibile (${err.message})`;
    status.className = 'err';
  }
});

$('btn-save').addEventListener('click', async () => {
  const current = await getSettings(messenger.storage.local);
  const settings = {
    ...current,
    obsidianUrl: $('obsidian-url').value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.obsidianUrl,
    obsidianApiKey: $('obsidian-key').value.trim(),
    clientsFolder: $('clients-folder').value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.clientsFolder,
    personalFolder: $('personal-folder').value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.personalFolder,
    personalPromisesFolder: $('promises-folder').value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.personalPromisesFolder,
    inboxFolder: $('inbox-folder').value.trim().replace(/\/+$/, '') || DEFAULT_SETTINGS.inboxFolder,
    tagVault: $('tag-vault').value.trim() || DEFAULT_SETTINGS.tagVault,
    pecAccountIds: [...document.querySelectorAll('#accounts input:checked')].map((cb) => cb.value),
    endpointUrl: $('endpoint').value.trim().replace(/\/+$/, '') || 'http://localhost:11434',
    model: $('model').value,
    maxMessages: Math.min(100, Math.max(2, Number($('max-messages').value) || 30)),
  };
  await messenger.storage.local.set({ settings });
  $('save-status').textContent = 'Salvato ✓';
  $('save-status').className = 'ok';
  setTimeout(() => ($('save-status').textContent = ''), 1500);
});

load();
