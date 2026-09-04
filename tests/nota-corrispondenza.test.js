import { describe, it, expect } from 'vitest';
import { sanitizza, mittenteBreve, nomeNota, sha256Hex, costruisciNota, rigaCronologia } from '../lib/nota-corrispondenza.js';

const HEADER = {
  headerMessageId: 'abc123@mail.example.com',
  author: 'Nicola Viola <nicola@sapg.it>',
  recipients: ['Guglielmo Puzio <g.puzio@sapg.it>'],
  ccList: ['Navla <n@navla.it>'],
  date: new Date('2026-09-04T09:30:00Z'),
  subject: 'Re: AI Act / etichettatura: "prossimi passi"?',
};

describe('nota di corrispondenza', () => {
  it('sanitizza i nomi e accorcia il mittente', () => {
    expect(sanitizza('a/b:c*d?e"f<g>h|i')).toBe('a b c d e f g h i');
    expect(mittenteBreve('Nicola Viola <nicola@sapg.it>')).toBe('Nicola Viola');
    expect(mittenteBreve('nicola@sapg.it')).toBe('nicola@sapg.it');
  });

  it('nomeNota: data, mittente, oggetto, senza caratteri vietati e non oltre 120 caratteri', () => {
    const nome = nomeNota({ data: '2026-09-04', mittente: 'Nicola Viola', oggetto: HEADER.subject });
    expect(nome).toBe('2026-09-04 — Nicola Viola — Re AI Act etichettatura prossimi passi');
    expect(nomeNota({ data: '2026-09-04', mittente: 'X', oggetto: 'y'.repeat(300) }).length).toBeLessThanOrEqual(120);
  });

  it('sha256Hex calcola l\'impronta esadecimale', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('costruisciNota: frontmatter quotato e completo, corpo verbatim, allegati, proposte', () => {
    const md = costruisciNota({
      header: HEADER, testo: 'Buongiorno,\nconfermo per giovedì.\n', cliente: 'SAPG', pratica: 'Pratica — Etichettatura contenuti IA (AI Act)',
      account: 'SAPG (IMAP)', pec: false, threadKey: '1a2b3c4d',
      allegati: [{ nome: 'bozza.pdf', path: '📁 Clienti/SAPG/Allegati/2026-09-04 — bozza.pdf' }], emlPath: '', sha256: '',
    });
    expect(md.startsWith('---\ntipo: "corrispondenza"\n')).toBe(true);
    expect(md).toContain('message_id: "abc123@mail.example.com"');
    expect(md).toContain('da: "Nicola Viola <nicola@sapg.it>"');
    expect(md).toContain('a: ["Guglielmo Puzio <g.puzio@sapg.it>"]');
    expect(md).toContain('cc: ["Navla <n@navla.it>"]');
    expect(md).toContain('data: "2026-09-04"');
    expect(md).toContain('oggetto: "Re: AI Act / etichettatura: \\"prossimi passi\\"?"');
    expect(md).toContain('cliente: "SAPG"');
    expect(md).toContain('pratica: "Pratica — Etichettatura contenuti IA (AI Act)"');
    expect(md).toContain('allegati: ["📁 Clienti/SAPG/Allegati/2026-09-04 — bozza.pdf"]');
    expect(md).toContain('eml: ""').toBeUndefined;
    expect(md).toContain('raw_sha256: ""');
    expect(md).toContain('pec: false');
    expect(md).toContain('tags: ["corrispondenza", "mail"]');
    expect(md).toContain('## Testo\n\nBuongiorno,\nconfermo per giovedì.');
    expect(md).toContain('[[📁 Clienti/SAPG/Allegati/2026-09-04 — bozza.pdf|bozza.pdf]]');
    expect(md.trim().endsWith('## 🤖 Proposte\n\n_(vuoto: le proposte dell\'IA arrivano qui, mai scritte da sole nella pratica)_')).toBe(true);
  });

  it('una PEC porta il tag pec, l\'eml e l\'impronta', () => {
    const md = costruisciNota({ header: HEADER, testo: 'x', cliente: 'SAPG', pratica: '', account: 'PEC', pec: true, threadKey: 'k', allegati: [], emlPath: '📁 Clienti/SAPG/Allegati/eml/abc123.eml', sha256: 'deadbeef' });
    expect(md).toContain('pec: true');
    expect(md).toContain('eml: "📁 Clienti/SAPG/Allegati/eml/abc123.eml"');
    expect(md).toContain('raw_sha256: "deadbeef"');
    expect(md).toContain('tags: ["corrispondenza", "mail", "pec"]');
    expect(md).toContain('pratica: ""');
  });

  it('rigaCronologia', () => {
    expect(rigaCronologia({ data: '2026-09-04', notaNome: '2026-09-04 — Nicola Viola — Re AI Act', mittente: 'Nicola Viola' }))
      .toBe('- 2026-09-04 — 📧 [[2026-09-04 — Nicola Viola — Re AI Act]] da Nicola Viola');
  });
});
