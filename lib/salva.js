/**
 * Orchestrazione del salvataggio di un messaggio nel vault: nota verbatim, allegati,
 * originale .eml (PEC o a richiesta) con SHA-256, riga in cronologia, tag in Thunderbird.
 * Idempotente: se il Message-ID è già nel vault non scrive nulla.
 * `messenger` e `vault` sono iniettati: qui non c'è nessuna API globale.
 */
import { nomeNota, mittenteBreve, sanitizza, sha256Hex, costruisciNota, rigaCronologia } from './nota-corrispondenza.js';

export const COLORE_TAG = '#7c4dff';

export function cartelle(settings, scelta) {
  if (scelta.destinazione === 'cliente') {
    const base = `${settings.clientsFolder}/${scelta.cliente}`;
    const scheda = scelta.pratica ? `${base}/Pratiche/${scelta.pratica}.md` : `${base}/${scelta.cliente} — scheda cliente.md`;
    return { note: `${base}/Corrispondenza`, allegati: `${base}/Allegati`, scheda };
  }
  const base = scelta.destinazione === 'personale' ? settings.personalFolder : settings.inboxFolder;
  return { note: base, allegati: `${base}/Allegati`, scheda: '' };
}

/** Percorso «H1::H2» della prima intestazione il cui testo combacia con `regex`. */
export function percorsoIntestazione(testo, regex) {
  const pila = [];
  let inCodice = false;
  for (const riga of String(testo).split('\n')) {
    if (/^```/.test(riga)) inCodice = !inCodice;
    if (inCodice) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(riga);
    if (!m) continue;
    const livello = m[1].length;
    pila.splice(livello - 1);
    pila[livello - 1] = m[2].trim();
    if (regex.test(pila[livello - 1])) return pila.filter(Boolean).join('::');
  }
  return '';
}

export async function percorsoLibero(vault, path) {
  if (!(await vault.exists(path))) return path;
  const [, base, ext = ''] = /^(.*?)(\.[^./]+)?$/.exec(path);
  for (let n = 2; n < 1000; n++) {
    const candidato = `${base} (${n})${ext}`;
    if (!(await vault.exists(candidato))) return candidato;
  }
  throw new Error(`Troppi duplicati per ${path}`);
}

export async function assicuraTag(messenger, nome) {
  const tags = await messenger.messages.tags.list();
  const hit = tags.find((t) => t.tag.toLowerCase() === nome.toLowerCase());
  if (hit) return hit.key;
  const key = nome.toLowerCase().replace(/[^a-z0-9]/g, '_');
  await messenger.messages.tags.create(key, nome, COLORE_TAG);
  return key;
}

const giorno = (d) => new Date(d).toISOString().slice(0, 10);
const bytesDi = async (file) => new Uint8Array(await file.arrayBuffer());

// Header che Thunderbird antepone nel proprio archivio locale: non fanno parte del messaggio
// ricevuto, quindi l'originale (e la sua impronta) li esclude. Solo in testa, continuazioni comprese.
const HEADER_INTERNI = ['X-Mozilla-Status:', 'X-Mozilla-Status2:', 'X-Mozilla-Keys:'];
export function pulisciRaw(bytes) {
  const testa = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 8192)));
  let pos = 0;
  const rigaDa = (i) => { const f = testa.indexOf('\n', i); return f === -1 ? testa.slice(i) : testa.slice(i, f + 1); };
  while (pos < testa.length) {
    const riga = rigaDa(pos);
    if (!HEADER_INTERNI.some((h) => riga.startsWith(h))) break;
    pos += riga.length;
    while (pos < testa.length && (testa[pos] === ' ' || testa[pos] === '\t')) pos += rigaDa(pos).length;
  }
  return pos ? bytes.subarray(pos) : bytes;
}

const ANIMA = { cliente: ['legal'], personale: ['personale'], inbox: [] };

/** Un allegato «vero» ha un nome e non è una parte inline referenziata dal corpo (loghi delle firme, immagini incorporate). */
export function èAllegatoVero(a) {
  if (!a?.name) return false;
  if (a.contentId) return false;
  if (String(a.contentDisposition ?? '').toLowerCase() === 'inline') return false;
  return true;
}

export async function salvaMessaggio({ messenger, vault, settings, header, scelta, estraiTesto, account, threadKey = '' }) {
  const trovati = await vault.searchSimple(header.headerMessageId);
  const gia = (trovati ?? []).find((r) => typeof r.filename === 'string' && r.filename.endsWith('.md'));
  if (gia) return { giaSalvato: true, nota: gia.filename, allegati: [], eml: '', sha256: '', cronologia: false, avvisi: [] };

  const dove = cartelle(settings, scelta);
  const data = giorno(header.date);
  const avvisi = [];
  const pec = (settings.pecAccountIds ?? []).includes(header.folder?.accountId);

  // 1. allegati veri (con nome, non inline)
  const allegati = [];
  let inlineIgnorati = 0;
  for (const a of await messenger.messages.listAttachments(header.id)) {
    if (!èAllegatoVero(a)) {
      if (a.name) inlineIgnorati++;
      continue;
    }
    const path = await percorsoLibero(vault, `${dove.allegati}/${data} — ${sanitizza(a.name)}`);
    const file = await messenger.messages.getAttachmentFile(header.id, a.partName);
    await vault.putBinary(path, await bytesDi(file), a.contentType || 'application/octet-stream');
    allegati.push({ nome: a.name, path });
  }

  // 2. originale .eml: sempre per le PEC, altrimenti a richiesta
  let emlPath = '';
  let sha256 = '';
  if (pec || scelta.salvaEml) {
    const raw = await messenger.messages.getRaw(header.id, { data_format: 'File' });
    const bytes = pulisciRaw(await bytesDi(raw));
    sha256 = await sha256Hex(bytes);
    emlPath = await percorsoLibero(vault, `${dove.allegati}/eml/${sanitizza(header.headerMessageId)}.eml`);
    await vault.putBinary(emlPath, bytes, 'message/rfc822');
  }

  // 3. la nota
  const testo = await estraiTesto(await messenger.messages.getFull(header.id), header);
  const mittente = mittenteBreve(header.author);
  const notaPath = await percorsoLibero(vault, `${dove.note}/${nomeNota({ data, mittente, oggetto: header.subject })}.md`);
  const notaNome = notaPath.slice(notaPath.lastIndexOf('/') + 1, -3);
  await vault.putNote(notaPath, costruisciNota({
    header, testo, cliente: scelta.cliente ?? '', pratica: scelta.pratica ?? '', account, pec, threadKey, allegati, emlPath, sha256,
    anima: ANIMA[scelta.destinazione] ?? [],
  }));

  // 4. riga in cronologia della pratica (o della scheda cliente)
  let cronologia = false;
  if (dove.scheda) {
    try {
      const target = percorsoIntestazione(await vault.readNote(dove.scheda), /cronologia/i);
      if (target) {
        await vault.appendToHeading(dove.scheda, target, rigaCronologia({ data, notaNome, mittente }));
        cronologia = true;
      } else avvisi.push(`Nessuna sezione «Cronologia» in ${dove.scheda}`);
    } catch (e) {
      avvisi.push(`Cronologia non aggiornata: ${e.message}`);
    }
  }

  // 5. tag in Thunderbird
  try {
    const key = await assicuraTag(messenger, settings.tagVault);
    const tags = [...new Set([...(header.tags ?? []), key])];
    await messenger.messages.update(header.id, { tags });
  } catch (e) {
    avvisi.push(`Tag non applicato: ${e.message}`);
  }

  return { giaSalvato: false, nota: notaPath, allegati: allegati.map((a) => a.path), inlineIgnorati, eml: emlPath, sha256, cronologia, avvisi };
}
