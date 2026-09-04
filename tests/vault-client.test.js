import { describe, it, expect } from 'vitest';
import { createVaultClient, VaultError } from '../lib/vault-client.js';

function fakeFetch(responses = []) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const r = responses.shift();
    return r ?? { ok: true, status: 200, text: async () => '', json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}
const CFG = { baseUrl: 'http://127.0.0.1:27123/', apiKey: 'SEGRETO' };

describe('vault-client', () => {
  it('putNote fa una PUT text/markdown autenticata sul percorso codificato', async () => {
    const fetchFn = fakeFetch();
    await createVaultClient({ ...CFG, fetchFn }).putNote('📁 Clienti/SAPG/Corrispondenza/2026-09-04 — x — y.md', '# ciao');
    const { url, init } = fetchFn.calls[0];
    expect(decodeURI(url)).toBe('http://127.0.0.1:27123/vault/📁 Clienti/SAPG/Corrispondenza/2026-09-04 — x — y.md');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer SEGRETO');
    expect(init.headers['Content-Type']).toBe('text/markdown');
    expect(init.body).toBe('# ciao');
  });

  it('putBinary manda i byte con il content-type dato', async () => {
    const fetchFn = fakeFetch();
    const bytes = new Uint8Array([1, 2, 3]);
    await createVaultClient({ ...CFG, fetchFn }).putBinary('📁 Clienti/SAPG/Allegati/a.pdf', bytes, 'application/pdf');
    const { init } = fetchFn.calls[0];
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/pdf');
    expect(init.body).toBe(bytes);
  });

  it('exists distingue 200 da 404 e propaga gli altri errori', async () => {
    const c = createVaultClient({ ...CFG, fetchFn: fakeFetch([{ ok: true, status: 200 }, { ok: false, status: 404, text: async () => 'no' }, { ok: false, status: 401, text: async () => 'unauthorized' }]) });
    expect(await c.exists('a.md')).toBe(true);
    expect(await c.exists('b.md')).toBe(false);
    await expect(c.exists('c.md')).rejects.toBeInstanceOf(VaultError);
  });

  it('appendToHeading e setFrontmatter usano il PATCH JSON di markdown-patch 2.0', async () => {
    const fetchFn = fakeFetch();
    const c = createVaultClient({ ...CFG, fetchFn });
    await c.appendToHeading('p.md', '📂 Pratica::🗓️ Cronologia', '- riga');
    await c.setFrontmatter('p.md', 'prossima_scadenza', '2026-09-10');
    expect(fetchFn.calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(fetchFn.calls[0].init.body)).toEqual({ targetType: 'heading', target: ['📂 Pratica', '🗓️ Cronologia'], operation: 'append', content: '- riga' });
    expect(JSON.parse(fetchFn.calls[1].init.body)).toEqual({ targetType: 'frontmatter', target: 'prossima_scadenza', operation: 'replace', value: '2026-09-10' });
  });

  it('listFolder separa cartelle e file', async () => {
    const fetchFn = fakeFetch([{ ok: true, status: 200, json: async () => ({ files: ['SAPG/', 'Alpha/', 'nota.md'] }) }]);
    const r = await createVaultClient({ ...CFG, fetchFn }).listFolder('📁 Clienti');
    expect(decodeURI(fetchFn.calls[0].url)).toBe('http://127.0.0.1:27123/vault/📁 Clienti/');
    expect(r).toEqual({ folders: ['SAPG', 'Alpha'], files: ['nota.md'] });
  });

  it('searchSimple cerca un testo e restituisce i file trovati', async () => {
    const fetchFn = fakeFetch([{ ok: true, status: 200, json: async () => [{ filename: 'a.md', score: 1 }] }]);
    const r = await createVaultClient({ ...CFG, fetchFn }).searchSimple('<abc@example.com>');
    expect(fetchFn.calls[0].init.method).toBe('POST');
    expect(fetchFn.calls[0].url).toBe('http://127.0.0.1:27123/search/simple/?query=' + encodeURIComponent('<abc@example.com>') + '&contextLength=0');
    expect(r).toEqual([{ filename: 'a.md', score: 1 }]);
  });

  it('readNote restituisce il testo e info legge lo stato del server', async () => {
    const fetchFn = fakeFetch([{ ok: true, status: 200, text: async () => '# x' }, { ok: true, status: 200, json: async () => ({ authenticated: true }) }]);
    const c = createVaultClient({ ...CFG, fetchFn });
    expect(await c.readNote('x.md')).toBe('# x');
    expect(await c.info()).toEqual({ authenticated: true });
  });
});
