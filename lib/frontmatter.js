/**
 * Legge il frontmatter delle note del brain: valori quotati, liste inline `[a, b]`
 * o a trattini. Non è un parser YAML completo, di proposito (nessuna dipendenza).
 */
const CHIAVE = /^([A-Za-z_][\w-]*):\s*(.*)$/;
const VOCE = /^\s+-\s*(.*)$/;

function pulisci(v) {
  v = v.trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) return v.slice(1, -1);
  return v;
}

export function leggiFrontmatter(testo) {
  if (!testo.startsWith('---')) return {};
  const fine = testo.indexOf('\n---', 3);
  if (fine === -1) return {};
  const dati = {};
  let inAttesa = null;
  for (const riga of testo.slice(3, fine).split('\n')) {
    const voce = VOCE.exec(riga);
    if (voce && inAttesa !== null) {
      if (dati[inAttesa] === '') dati[inAttesa] = [];
      dati[inAttesa].push(pulisci(voce[1]));
      continue;
    }
    const m = CHIAVE.exec(riga);
    if (!m) continue;
    const [, chiave, valore] = m;
    inAttesa = null;
    const v = valore.trim();
    if (v === '') {
      dati[chiave] = '';
      inAttesa = chiave;
    } else if (v.startsWith('[') && v.endsWith(']')) {
      dati[chiave] = v.slice(1, -1).split(',').map(pulisci).filter((x) => x !== '');
    } else {
      dati[chiave] = pulisci(v);
    }
  }
  return dati;
}
