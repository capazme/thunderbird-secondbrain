import { describe, it, expect } from 'vitest';
import { cartelle, percorsoIntestazione, percorsoLibero, assicuraTag, salvaMessaggio } from '../lib/salva.js';
import { mergeSettings } from '../lib/settings.js';
import { sha256Hex } from '../lib/nota-corrispondenza.js';

const HEADER = {
  id: 7, headerMessageId: 'abc123@mail.example.com', author: 'Nicola Viola <nicola@sapg.it>',
  recipients: ['Guglielmo Puzio <g.puzio@sapg.it>'], ccList: [], date: new Date('2026-09-04T09:30:00Z'),
  subject: 'Re: AI Act', tags: ['$label1'], folder: { accountId: 'account2', name: 'Inbox' },
};
const PRATICA = '---\ntipo: "pratica"\n---\n# 📂 Pratica\n\n## 📌 Stato\n\n## 🗓️ Cronologia\n\n- 2026-09-01 — apertura\n\n## Note\n';

function ambiente({ esistenti = [], trovati = [], tags = [] } = {}) {
  const scritti = []; const patch = []; const update = []; const creati = [];
  const vault = {
    async putNote(p, md) { scritti.push({ p, md }); esistenti.push(p); },
    async putBinary(p, bytes, ct) { scritti.push({ p, bytes, ct }); esistenti.push(p); },
    async exists(p) { return esistenti.includes(p); },
    async readNote(p) { return p.includes('Pratiche') ? PRATICA : '# scheda\n\n## Cronologia\n'; },
    async appendToHeading(p, target, content) { patch.push({ p, target, content }); },
    async searchSimple() { return trovati; },
  };
  const messenger = { messages: {
    async getFull() { return { parts: [] }; },
    async listAttachments() { return [{ partName: '1.2', name: 'bozza.pdf', contentType: 'application/pdf', size: 3 }, { partName: '1.3', name: '', contentType: 'image/png', size: 1 }]; },
    async getAttachmentFile() { return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; },
    async getRaw() { return { arrayBuffer: async () => new TextEncoder().encode('Raw mail').buffer }; },
    async update(id, props) { update.push({ id, props }); },
    tags: { async list() { return tags; }, async create(key, tag, color) { creati.push({ key, tag, color }); } },
  } };
  return { vault, messenger, scritti, patch, update, creati };
}
const estraiTesto = async () => 'Testo della mail';

describe('salva: cartelle e utilità', () => {
  const s = mergeSettings({});
  it('cartelle per cliente, personale e inbox', () => {
    expect(cartelle(s, { destinazione: 'cliente', cliente: 'SAPG', pratica: 'Pratica — X' })).toEqual({ note: '📁 Clienti/SAPG/Corrispondenza', allegati: '📁 Clienti/SAPG/Allegati', scheda: '📁 Clienti/SAPG/Pratiche/Pratica — X.md' });
    expect(cartelle(s, { destinazione: 'cliente', cliente: 'SAPG', pratica: '' }).scheda).toBe('📁 Clienti/SAPG/SAPG — scheda cliente.md');
    expect(cartelle(s, { destinazione: 'personale' })).toEqual({ note: '🌱 Personale/Corrispondenza', allegati: '🌱 Personale/Corrispondenza/Allegati', scheda: '' });
    expect(cartelle(s, { destinazione: 'inbox' }).note).toBe('📥 Inbox');
  });
  it('percorsoIntestazione trova il percorso «::» della prima intestazione che combacia', () => {
    expect(percorsoIntestazione(PRATICA, /cronologia/i)).toBe('📂 Pratica::🗓️ Cronologia');
    expect(percorsoIntestazione('# A\n\n### C\n', /c/i)).toBe('A::C');
    expect(percorsoIntestazione('# A\n', /zzz/)).toBe('');
  });
  it('percorsoLibero aggiunge (2), (3)… prima dell\'estensione', async () => {
    const { vault } = ambiente({ esistenti: ['x/nota.md', 'x/nota (2).md', 'x/a.b/c.pdf'] });
    expect(await percorsoLibero(vault, 'x/nota.md')).toBe('x/nota (3).md');
    expect(await percorsoLibero(vault, 'x/a.b/c.pdf')).toBe('x/a.b/c (2).pdf');
    expect(await percorsoLibero(vault, 'x/nuova.md')).toBe('x/nuova.md');
  });
  it('assicuraTag riusa il tag esistente o lo crea', async () => {
    const a = ambiente({ tags: [{ key: '$label1', tag: 'Importante' }, { key: 'vault', tag: 'Vault' }] });
    expect(await assicuraTag(a.messenger, 'vault')).toBe('vault');
    expect(a.creati).toEqual([]);
    const b = ambiente();
    expect(await assicuraTag(b.messenger, 'vault')).toBe('vault');
    expect(b.creati).toEqual([{ key: 'vault', tag: 'vault', color: '#7c4dff' }]);
  });
});

describe('salvaMessaggio', () => {
  it('cliente+pratica: nota, allegato, riga in cronologia, tag; niente eml se non PEC', async () => {
    const a = ambiente();
    const r = await salvaMessaggio({ messenger: a.messenger, vault: a.vault, settings: mergeSettings({}), header: HEADER, scelta: { destinazione: 'cliente', cliente: 'SAPG', pratica: 'Pratica — X', salvaEml: false }, estraiTesto, account: 'SAPG' });
    expect(r.giaSalvato).toBe(false);
    expect(r.nota).toBe('📁 Clienti/SAPG/Corrispondenza/2026-09-04 — Nicola Viola — Re AI Act.md');
    expect(r.allegati).toEqual(['📁 Clienti/SAPG/Allegati/2026-09-04 — bozza.pdf']);
    expect(r.eml).toBe('');
    const nota = a.scritti.find((s) => s.p === r.nota).md;
    expect(nota).toContain('pratica: "Pratica — X"');
    expect(nota).toContain('Testo della mail');
    expect(a.scritti.find((s) => s.p === r.allegati[0])).toMatchObject({ ct: 'application/pdf' });
    expect(a.patch).toEqual([{ p: '📁 Clienti/SAPG/Pratiche/Pratica — X.md', target: '📂 Pratica::🗓️ Cronologia', content: '- 2026-09-04 — 📧 [[2026-09-04 — Nicola Viola — Re AI Act]] da Nicola Viola' }]);
    expect(a.update).toEqual([{ id: 7, props: { tags: ['$label1', 'vault'] } }]);
    expect(r.cronologia).toBe(true);
  });
  it('account PEC: salva sempre l\'eml con impronta SHA-256', async () => {
    const a = ambiente();
    const settings = mergeSettings({ pecAccountIds: ['account2'] });
    const r = await salvaMessaggio({ messenger: a.messenger, vault: a.vault, settings, header: HEADER, scelta: { destinazione: 'cliente', cliente: 'SAPG', pratica: '' }, estraiTesto, account: 'PEC' });
    expect(r.eml).toBe('📁 Clienti/SAPG/Allegati/eml/abc123@mail.example.com.eml');
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.scritti.find((s) => s.p === r.eml)).toMatchObject({ ct: 'message/rfc822' });
    const nota = a.scritti.find((s) => s.p === r.nota).md;
    expect(nota).toContain('pec: true');
    expect(nota).toContain(`raw_sha256: "${r.sha256}"`);
    expect(a.patch[0]).toMatchObject({ p: '📁 Clienti/SAPG/SAPG — scheda cliente.md', target: 'scheda::Cronologia' });
  });
  it('già salvato: non scrive nulla e restituisce la nota trovata', async () => {
    const a = ambiente({ trovati: [{ filename: '📁 Clienti/SAPG/Corrispondenza/vecchia.md', score: 1 }] });
    const r = await salvaMessaggio({ messenger: a.messenger, vault: a.vault, settings: mergeSettings({}), header: HEADER, scelta: { destinazione: 'inbox' }, estraiTesto, account: 'x' });
    expect(r).toMatchObject({ giaSalvato: true, nota: '📁 Clienti/SAPG/Corrispondenza/vecchia.md' });
    expect(a.scritti).toEqual([]);
  });
  it('destinazione inbox: nessuna cronologia, nota nella cartella inbox, nome libero se esiste', async () => {
    const a = ambiente({ esistenti: ['📥 Inbox/2026-09-04 — Nicola Viola — Re AI Act.md'] });
    const r = await salvaMessaggio({ messenger: a.messenger, vault: a.vault, settings: mergeSettings({}), header: HEADER, scelta: { destinazione: 'inbox' }, estraiTesto, account: 'x' });
    expect(r.nota).toBe('📥 Inbox/2026-09-04 — Nicola Viola — Re AI Act (2).md');
    expect(r.cronologia).toBe(false);
    expect(a.patch).toEqual([]);
  });
});

describe('originale .eml e anima', () => {
  it('pulisciRaw toglie solo gli header X-Mozilla-* in testa (con continuazioni), non altrove', async () => {
    const { pulisciRaw } = await import('../lib/salva.js');
    const enc = (s) => new TextEncoder().encode(s);
    const raw = enc('X-Mozilla-Status: 0001\r\nX-Mozilla-Status2: 00000000\r\nX-Mozilla-Keys: vault\r\n  altro\r\nReturn-Path: <a@b.it>\r\nSubject: x\r\n\r\nX-Mozilla-Status: nel corpo\r\n');
    expect(new TextDecoder().decode(pulisciRaw(raw))).toBe('Return-Path: <a@b.it>\r\nSubject: x\r\n\r\nX-Mozilla-Status: nel corpo\r\n');
    const pulito = enc('Return-Path: <a@b.it>\r\n');
    expect(pulisciRaw(pulito)).toBe(pulito);
  });
  it('salva: l\'impronta è calcolata sull\'originale ripulito e la nota inbox/personale ha l\'anima giusta', async () => {
    const a = ambiente();
    a.messenger.messages.getRaw = async () => ({ arrayBuffer: async () => new TextEncoder().encode('X-Mozilla-Status: 0001\r\nSubject: x\r\n').buffer });
    const r = await salvaMessaggio({ messenger: a.messenger, vault: a.vault, settings: mergeSettings({}), header: HEADER, scelta: { destinazione: 'inbox', salvaEml: true }, estraiTesto, account: 'x' });
    const eml = a.scritti.find((s) => s.p === r.eml);
    expect(new TextDecoder().decode(eml.bytes)).toBe('Subject: x\r\n');
    expect(r.sha256).toBe(await sha256Hex(new TextEncoder().encode('Subject: x\r\n')));
    expect(a.scritti.find((s) => s.p === r.nota).md).toContain('anima: []');
    const b = ambiente();
    const p = await salvaMessaggio({ messenger: b.messenger, vault: b.vault, settings: mergeSettings({}), header: HEADER, scelta: { destinazione: 'personale' }, estraiTesto, account: 'x' });
    expect(b.scritti.find((s) => s.p === p.nota).md).toContain('anima: ["personale"]');
  });
});
