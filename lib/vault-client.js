/**
 * Client per la Local REST API di Obsidian (v5, markdown-patch 2.0).
 * Tutto su localhost con Bearer token; `fetchFn` iniettabile per i test.
 */
export class VaultError extends Error {
  constructor(status, detail) {
    super(`Obsidian REST ${status}: ${detail}`);
    this.name = 'VaultError';
    this.status = status;
    this.detail = detail;
  }
}

export function createVaultClient({ baseUrl, apiKey, fetchFn = globalThis.fetch }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${apiKey}` };
  const vaultUrl = (path) => `${base}/vault/${encodeURI(path)}`;

  async function request(url, init) {
    const res = await fetchFn(url, init);
    if (!res.ok) {
      const detail = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
      throw new VaultError(res.status, detail);
    }
    return res;
  }

  const putNote = (path, markdown) =>
    request(vaultUrl(path), { method: 'PUT', headers: { ...auth, 'Content-Type': 'text/markdown' }, body: markdown });

  const putBinary = (path, bytes, contentType = 'application/octet-stream') =>
    request(vaultUrl(path), { method: 'PUT', headers: { ...auth, 'Content-Type': contentType }, body: bytes });

  async function readNote(path) {
    const res = await request(vaultUrl(path), { method: 'GET', headers: { ...auth } });
    return typeof res.text === 'function' ? res.text() : '';
  }

  async function exists(path) {
    const res = await fetchFn(vaultUrl(path), { method: 'GET', headers: { ...auth } });
    if (res.status === 404) return false;
    if (!res.ok) throw new VaultError(res.status, typeof res.text === 'function' ? await res.text().catch(() => '') : '');
    return true;
  }

  const patchJson = (path, instruction) =>
    request(vaultUrl(path), { method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(instruction) });

  // La Local REST API 5.x vuole il target «heading» come ARRAY di testi (H1, H2, …); accettiamo anche «H1::H2».
  const appendToHeading = (path, target, content) =>
    patchJson(path, { targetType: 'heading', target: Array.isArray(target) ? target : String(target).split('::'), operation: 'append', content });
  const setFrontmatter = (path, key, value) => patchJson(path, { targetType: 'frontmatter', target: key, operation: 'replace', value });

  async function listFolder(folder) {
    const res = await request(`${base}/vault/${encodeURI(folder)}/`, { method: 'GET', headers: { ...auth } });
    const data = await res.json();
    const entries = data.files ?? [];
    return {
      folders: entries.filter((f) => f.endsWith('/')).map((f) => f.replace(/\/$/, '')),
      files: entries.filter((f) => !f.endsWith('/')),
    };
  }

  async function searchSimple(query, contextLength = 0) {
    const res = await request(`${base}/search/simple/?query=${encodeURIComponent(query)}&contextLength=${contextLength}`, { method: 'POST', headers: { ...auth } });
    return res.json();
  }

  async function info() {
    const res = await request(`${base}/`, { method: 'GET', headers: { ...auth } });
    return res.json();
  }

  return { putNote, putBinary, readNote, exists, appendToHeading, setFrontmatter, listFolder, searchSimple, info };
}
