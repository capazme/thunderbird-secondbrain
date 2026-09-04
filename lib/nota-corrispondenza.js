/**
 * La nota di corrispondenza: nome file, frontmatter quotato secondo i contratti del brain,
 * corpo verbatim, allegati, sezione per le proposte dell'IA (vuota). Funzioni pure.
 */
const VIETATI = /[\\/:*?"<>|]/g;

export function sanitizza(nome) {
  return String(nome ?? '').replace(VIETATI, ' ').replace(/\s+/g, ' ').trim();
}

export function mittenteBreve(author) {
  const s = String(author ?? '').trim();
  const m = s.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  return (m ? m[1] : s).trim();
}

export function nomeNota({ data, mittente, oggetto }) {
  const base = `${data} — ${sanitizza(mittente)} — ${sanitizza(oggetto) || '(senza oggetto)'}`;
  return base.length > 120 ? base.slice(0, 120).trim() : base;
}

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const q = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
const lista = (xs) => `[${(xs ?? []).map(q).join(', ')}]`;
const giorno = (d) => new Date(d).toISOString().slice(0, 10);

export function costruisciNota({ header, testo, cliente, pratica, account, pec, threadKey, allegati = [], emlPath = '', sha256 = '', anima = ['legal'] }) {
  const tags = ['corrispondenza', 'mail', ...(pec ? ['pec'] : [])];
  const fm = [
    '---',
    `tipo: "corrispondenza"`,
    `message_id: ${q(header.headerMessageId)}`,
    `thread_key: ${q(threadKey)}`,
    `da: ${q(header.author)}`,
    `a: ${lista(header.recipients)}`,
    `cc: ${lista(header.ccList)}`,
    `data: ${q(giorno(header.date))}`,
    `oggetto: ${q(header.subject)}`,
    `cliente: ${q(cliente)}`,
    `pratica: ${q(pratica)}`,
    `allegati: ${lista(allegati.map((a) => a.path))}`,
    `eml: ${q(emlPath)}`,
    `raw_sha256: ${q(sha256)}`,
    `account: ${q(account)}`,
    `pec: ${pec ? 'true' : 'false'}`,
    `anima: ${lista(anima)}`,
    `tags: ${lista(tags)}`,
    '---',
  ].join('\n');
  const intestazioni = [
    `| | |`, `|---|---|`,
    `| **Da** | ${header.author} |`,
    `| **A** | ${(header.recipients ?? []).join(', ')} |`,
    ...(header.ccList?.length ? [`| **Cc** | ${header.ccList.join(', ')} |`] : []),
    `| **Data** | ${new Date(header.date).toISOString().replace('T', ' ').slice(0, 16)} |`,
    `| **Account** | ${account} |`,
    `| **Message-ID** | \`${header.headerMessageId}\` |`,
  ].join('\n');
  const allegatiMd = allegati.length ? allegati.map((a) => `- [[${a.path}|${a.nome}]]`).join('\n') : '_(nessuno)_';
  const emlMd = emlPath ? `\n\nOriginale: [[${emlPath}]] · SHA-256 \`${sha256}\`` : '';
  return `${fm}\n# 📧 ${header.subject || '(senza oggetto)'}\n\n${intestazioni}\n\n## Testo\n\n${String(testo ?? '').trim()}\n\n## Allegati\n\n${allegatiMd}${emlMd}\n\n## 🤖 Proposte\n\n_(vuoto: le proposte dell'IA arrivano qui, mai scritte da sole nella pratica)_\n`;
}

export function rigaCronologia({ data, notaNome, mittente }) {
  return `- ${data} — 📧 [[${notaNome}]] da ${mittente}`;
}
