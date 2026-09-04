import { describe, it, expect } from 'vitest';
import { costruisciPromessa, percorsoPromessa, creaPromessa, creaScadenza } from '../lib/promesse.js';
import { mergeSettings } from '../lib/settings.js';

const PRATICA = '---\ntipo: "pratica"\nprossima_scadenza: "2026-09-20"\ncalendario: "lavoro"\n---\n# 📂 Pratica — X\n\n## 🗓️ Cronologia\n- a\n\n## ⏰ Scadenze\n- \n';

function vaultFinto(note = {}) {
  const scritti = []; const patch = []; const fm = [];
  return {
    scritti, patch, fm,
    async putNote(p, md) { scritti.push({ p, md }); note[p] = md; },
    async exists(p) { return p in note; },
    async readNote(p) { return note[p]; },
    async appendToHeading(p, target, content) { patch.push({ p, target, content }); },
    async setFrontmatter(p, key, value) { fm.push({ p, key, value }); },
  };
}
const S = mergeSettings({});

describe('promesse', () => {
  it('costruisciPromessa segue il template Promessa, con origine e calendario', () => {
    const md = costruisciPromessa({ cosa: 'Inviare bozza DPA', aChi: 'Nicola', entro: '2026-09-10', cliente: 'SAPG', pratica: 'Pratica — X', calendario: 'lavoro', notaNome: '2026-09-04 — Nicola — Re AI Act', oggi: '2026-09-04' });
    for (const riga of ['tipo: "promessa"', 'cliente: "SAPG"', 'pratica: "Pratica — X"', 'a_chi: "Nicola"', 'cosa: "Inviare bozza DPA"', 'entro: "2026-09-10"', 'stato: "aperta"', 'fonte: "mail"', 'prossima_scadenza: "2026-09-10"', 'calendario: "lavoro"', 'avvisi: [1]', 'anima: ["legal"]', 'tags: ["promessa"]', 'origine: "2026-09-04 — Nicola — Re AI Act"']) expect(md).toContain(riga);
    expect(md).toContain('# 🤝 Inviare bozza DPA\n');
    expect(md).toContain('- **Presa il:** 2026-09-04');
    expect(md).toContain('- **Origine:** [[2026-09-04 — Nicola — Re AI Act]]');
    expect(md).toContain('## Esito');
    expect(costruisciPromessa({ cosa: 'x', aChi: 'y', entro: '2026-09-10', calendario: 'personale', oggi: '2026-09-04' })).toContain('anima: ["personale"]');
  });
  it('rifiuta una data non ISO', () => {
    expect(() => costruisciPromessa({ cosa: 'x', aChi: 'y', entro: '10/09/2026', oggi: '2026-09-04' })).toThrow(/data/i);
  });
  it('percorsoPromessa: cliente o personale', () => {
    expect(percorsoPromessa(S, { destinazione: 'cliente', cliente: 'SAPG' }, { entro: '2026-09-10', cosa: 'Inviare: bozza/DPA' })).toBe('📁 Clienti/SAPG/Promesse/2026-09-10 — Inviare bozza DPA.md');
    expect(percorsoPromessa(S, { destinazione: 'personale' }, { entro: '2026-09-10', cosa: 'Chiamare il dentista' })).toBe('🌱 Personale/Promesse/2026-09-10 — Chiamare il dentista.md');
  });
  it('creaPromessa scrive la nota senza sovrascrivere', async () => {
    const v = vaultFinto({ '📁 Clienti/SAPG/Promesse/2026-09-10 — x.md': '' });
    const r = await creaPromessa({ vault: v, settings: S, scelta: { destinazione: 'cliente', cliente: 'SAPG', pratica: 'Pratica — X' }, dati: { cosa: 'x', aChi: 'y', entro: '2026-09-10' }, notaNome: 'n', oggi: '2026-09-04' });
    expect(r.nota).toBe('📁 Clienti/SAPG/Promesse/2026-09-10 — x (2).md');
    expect(v.scritti[0].md).toContain('calendario: "lavoro"');
    const p = await creaPromessa({ vault: v, settings: S, scelta: { destinazione: 'personale' }, dati: { cosa: 'z', aChi: 'me', entro: '2026-09-11' }, notaNome: '', oggi: '2026-09-04' });
    expect(v.scritti[1].md).toContain('calendario: "personale"');
    expect(p.nota).toBe('🌱 Personale/Promesse/2026-09-11 — z.md');
  });
  it('creaScadenza: aggiorna prossima_scadenza solo se anticipa, e appende alla sezione Scadenze', async () => {
    const path = '📁 Clienti/SAPG/Pratiche/Pratica — X.md';
    const v = vaultFinto({ [path]: PRATICA });
    const r1 = await creaScadenza({ vault: v, settings: S, scelta: { destinazione: 'cliente', cliente: 'SAPG', pratica: 'Pratica — X' }, dati: { cosa: 'Udienza', data: '2026-09-10' }, notaNome: 'n' });
    expect(r1).toMatchObject({ scheda: path, prossimaAggiornata: true, precedente: '2026-09-20' });
    expect(v.fm).toEqual([{ p: path, key: 'prossima_scadenza', value: '2026-09-10' }]);
    expect(v.patch).toEqual([{ p: path, target: '📂 Pratica — X::⏰ Scadenze', content: '- 2026-09-10 — Udienza (da [[n]])' }]);
    const r2 = await creaScadenza({ vault: v, settings: S, scelta: { destinazione: 'cliente', cliente: 'SAPG', pratica: 'Pratica — X' }, dati: { cosa: 'Memoria', data: '2026-10-01' }, notaNome: '' });
    expect(r2.prossimaAggiornata).toBe(false);
    expect(v.fm.length).toBe(1);
    expect(v.patch[1].content).toBe('- 2026-10-01 — Memoria');
  });
  it('creaScadenza senza pratica né cliente è un errore chiaro', async () => {
    await expect(creaScadenza({ vault: vaultFinto(), settings: S, scelta: { destinazione: 'inbox' }, dati: { cosa: 'x', data: '2026-09-10' } })).rejects.toThrow(/cliente/i);
  });
});
