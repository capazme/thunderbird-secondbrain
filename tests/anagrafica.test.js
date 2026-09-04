import { describe, it, expect } from 'vitest';
import { leggiFrontmatter } from '../lib/frontmatter.js';
import { caricaClienti, pratiche, abbina } from '../lib/anagrafica.js';
import { VaultError } from '../lib/vault-client.js';

describe('frontmatter', () => {
  it('legge valori quotati, liste inline e a trattini, chiavi vuote', () => {
    const fm = leggiFrontmatter('---\ntipo: "cliente"\nnome: "SAPG"\ndomini: ["sapg.it", "sapglegal.it"]\ntags:\n  - legal\n  - cliente\nreferente: ""\npec:\n---\n# x\n');
    expect(fm).toEqual({ tipo: 'cliente', nome: 'SAPG', domini: ['sapg.it', 'sapglegal.it'], tags: ['legal', 'cliente'], referente: '', pec: '' });
  });
  it('senza blocco chiuso restituisce un oggetto vuoto', () => {
    expect(leggiFrontmatter('# solo testo')).toEqual({});
    expect(leggiFrontmatter('---\nx: 1\n')).toEqual({});
  });
});

function vaultFinto(file) {
  return {
    async listFolder(folder) {
      const prefix = folder.replace(/\/$/, '') + '/';
      const names = Object.keys(file).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
      if (!names.length) throw new VaultError(404, 'not found');
      const folders = [...new Set(names.filter((n) => n.includes('/')).map((n) => n.split('/')[0]))];
      const files = names.filter((n) => !n.includes('/'));
      return { folders, files };
    },
    async readNote(p) { if (!(p in file)) throw new VaultError(404, 'x'); return file[p]; },
    async exists(p) { return p in file; },
  };
}
const FILE = {
  '📁 Clienti/SAPG/SAPG — scheda cliente.md': '---\ntipo: "cliente"\nnome: "SAPG"\ntipo_cliente: "studio"\ndomini: ["sapg.it"]\nemail: ["nicola@altrodominio.com"]\n---\n# SAPG\n',
  '📁 Clienti/SAPG/Pratiche/Pratica — Etichettatura contenuti IA (AI Act).md': '---\ntipo: "pratica"\n---\n',
  '📁 Clienti/SAPG/Pratiche/Pratica — Tigros fornitori.md': '---\ntipo: "pratica"\n---\n',
  '📁 Clienti/Rossi/Rossi — scheda cliente.md': '---\ntipo: "cliente"\nnome: "Mario Rossi"\ntipo_cliente: "personale"\ndomini: []\nemail: ["mario.rossi@gmail.com"]\n---\n',
  '📁 Clienti/Senzascheda/Pratiche/Pratica — X.md': '---\ntipo: "pratica"\n---\n',
};

describe('anagrafica', () => {
  it('carica i clienti dalle schede, tollerando la scheda mancante', async () => {
    const clienti = await caricaClienti(vaultFinto(FILE), '📁 Clienti');
    expect(clienti.map((c) => c.cartella).sort()).toEqual(['Rossi', 'SAPG', 'Senzascheda']);
    const sapg = clienti.find((c) => c.cartella === 'SAPG');
    expect(sapg).toMatchObject({ nome: 'SAPG', tipoCliente: 'studio', domini: ['sapg.it'], email: ['nicola@altrodominio.com'] });
    expect(clienti.find((c) => c.cartella === 'Senzascheda')).toMatchObject({ nome: 'Senzascheda', domini: [], email: [] });
  });
  it('elenca le pratiche di un cliente senza estensione, vuoto se la cartella manca', async () => {
    expect(await pratiche(vaultFinto(FILE), '📁 Clienti', 'SAPG')).toEqual(['Pratica — Etichettatura contenuti IA (AI Act)', 'Pratica — Tigros fornitori']);
    expect(await pratiche(vaultFinto(FILE), '📁 Clienti', 'Rossi')).toEqual([]);
  });
  it('abbina per email esatta, poi per dominio o sottodominio, altrimenti candidati', async () => {
    const clienti = await caricaClienti(vaultFinto(FILE), '📁 Clienti');
    expect(abbina('Nicola@AltroDominio.com', clienti)).toMatchObject({ cliente: 'SAPG', fonte: 'email' });
    expect(abbina('tizio@posta.sapg.it', clienti)).toMatchObject({ cliente: 'SAPG', fonte: 'dominio' });
    expect(abbina('mario.rossi@gmail.com', clienti)).toMatchObject({ cliente: 'Rossi', fonte: 'email' });
    expect(abbina('qualcuno@gmail.com', clienti)).toEqual({ cliente: null, fonte: null, candidati: [] });
    const doppi = [...clienti, { nome: 'Altro', cartella: 'Altro', domini: ['sapg.it'], email: [] }];
    expect(abbina('x@sapg.it', doppi)).toMatchObject({ cliente: null, candidati: ['SAPG', 'Altro'] });
  });
});

describe('emailDi', () => {
  it('estrae l\'indirizzo da «Nome <addr>» o restituisce la stringa', async () => {
    const { emailDi } = await import('../lib/anagrafica.js');
    expect(emailDi('Nicola Viola <Nicola@SAPG.it>')).toBe('nicola@sapg.it');
    expect(emailDi('nicola@sapg.it')).toBe('nicola@sapg.it');
    expect(emailDi('')).toBe('');
  });
});
