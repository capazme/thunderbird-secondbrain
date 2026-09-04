/**
 * Promesse e scadenze prese da una mail. La promessa è una nota autonoma (template «Promessa»);
 * la scadenza vive nella scheda della pratica: `prossima_scadenza` + riga in «⏰ Scadenze».
 */
import { sanitizza } from './nota-corrispondenza.js';
import { leggiFrontmatter } from './frontmatter.js';
import { cartelle, percorsoIntestazione, percorsoLibero } from './salva.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const q = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

function controllaData(d) {
  if (!ISO.test(String(d ?? ''))) throw new Error(`Data non valida: «${d}» (serve AAAA-MM-GG)`);
  return d;
}

export function costruisciPromessa({ cosa, aChi, entro, cliente = '', pratica = '', calendario = 'lavoro', notaNome = '', oggi }) {
  controllaData(entro);
  const anima = calendario === 'personale' ? 'personale' : 'legal';
  const origine = notaNome ? `\n- **Origine:** [[${notaNome}]]` : '';
  return [
    '---',
    'tipo: "promessa"',
    `cliente: ${q(cliente)}`,
    `pratica: ${q(pratica)}`,
    `a_chi: ${q(aChi)}`,
    `cosa: ${q(cosa)}`,
    `entro: ${q(entro)}`,
    'stato: "aperta"',
    'fonte: "mail"',
    `prossima_scadenza: ${q(entro)}`,
    `calendario: ${q(calendario)}`,
    'avvisi: [1]',
    `anima: [${q(anima)}]`,
    'tags: ["promessa"]',
    `origine: ${q(notaNome)}`,
    '---',
    `# 🤝 ${cosa}`,
    '',
    `- **A chi:** ${aChi} · **Entro:** ${entro} · **Fonte:** mail`,
    `- **Presa il:** ${oggi}${origine}`,
    '',
    '## Esito',
    '- _(quando è fatta: metti `stato: "fatta"` e svuota `prossima_scadenza`)_',
    '',
  ].join('\n');
}

export function percorsoPromessa(settings, scelta, { entro, cosa }) {
  const cartella = scelta.destinazione === 'cliente' ? `${settings.clientsFolder}/${scelta.cliente}/Promesse` : settings.personalPromisesFolder;
  return `${cartella}/${controllaData(entro)} — ${sanitizza(cosa)}.md`;
}

export async function creaPromessa({ vault, settings, scelta, dati, notaNome = '', oggi }) {
  const calendario = scelta.destinazione === 'cliente' ? 'lavoro' : 'personale';
  const path = await percorsoLibero(vault, percorsoPromessa(settings, scelta, dati));
  await vault.putNote(path, costruisciPromessa({ ...dati, cliente: scelta.cliente ?? '', pratica: scelta.pratica ?? '', calendario, notaNome, oggi }));
  return { nota: path };
}

export async function creaScadenza({ vault, settings, scelta, dati, notaNome = '' }) {
  const data = controllaData(dati.data);
  const { scheda } = cartelle(settings, scelta);
  if (!scheda) throw new Error('Una scadenza va su una pratica o su una scheda cliente: scegli il cliente');
  const testo = await vault.readNote(scheda);
  const precedente = leggiFrontmatter(testo).prossima_scadenza ?? '';
  const prossimaAggiornata = !precedente || data < precedente;
  if (prossimaAggiornata) await vault.setFrontmatter(scheda, 'prossima_scadenza', data);
  const avvisi = [];
  const target = percorsoIntestazione(testo, /scadenze/i);
  const riga = `- ${data} — ${dati.cosa}${notaNome ? ` (da [[${notaNome}]])` : ''}`;
  if (target) await vault.appendToHeading(scheda, target, riga);
  else avvisi.push(`Nessuna sezione «Scadenze» in ${scheda}`);
  return { scheda, prossimaAggiornata, precedente, riga, avvisi };
}
