/**
 * Le anagrafiche vivono nel vault: una cartella per cliente sotto `clientsFolder`,
 * con la scheda `<cartella> — scheda cliente.md` (frontmatter `nome`, `domini`, `email`)
 * e la sottocartella `Pratiche/`.
 */
import { leggiFrontmatter } from './frontmatter.js';

const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export async function caricaClienti(vault, clientsFolder) {
  const { folders } = await vault.listFolder(clientsFolder);
  const clienti = [];
  for (const cartella of folders) {
    const scheda = `${clientsFolder}/${cartella}/${cartella} — scheda cliente.md`;
    let fm = {};
    try {
      if (await vault.exists(scheda)) fm = leggiFrontmatter(await vault.readNote(scheda));
    } catch {
      fm = {};
    }
    clienti.push({
      nome: fm.nome || cartella,
      cartella,
      tipoCliente: fm.tipo_cliente || '',
      domini: lista(fm.domini).map((d) => d.toLowerCase()),
      email: lista(fm.email).map((e) => e.toLowerCase()),
    });
  }
  return clienti;
}

export async function pratiche(vault, clientsFolder, cartella) {
  try {
    const { files } = await vault.listFolder(`${clientsFolder}/${cartella}/Pratiche`);
    return files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort();
  } catch (e) {
    if (e?.status === 404) return [];
    throw e;
  }
}

/** Abbina un indirizzo a un cliente: email esatta, poi dominio (o sottodominio). */
export function abbina(indirizzo, clienti) {
  const email = String(indirizzo ?? '').trim().toLowerCase();
  const dominio = email.split('@')[1] ?? '';
  const perEmail = clienti.find((c) => c.email.includes(email));
  if (perEmail) return { cliente: perEmail.cartella, fonte: 'email', candidati: [] };
  const perDominio = clienti.filter((c) => c.domini.some((d) => dominio === d || dominio.endsWith('.' + d)));
  if (perDominio.length === 1) return { cliente: perDominio[0].cartella, fonte: 'dominio', candidati: [] };
  return { cliente: null, fonte: null, candidati: perDominio.map((c) => c.cartella) };
}

/** Indirizzo (minuscolo) da un header «Nome <indirizzo>» o da un indirizzo nudo. */
export function emailDi(author) {
  const s = String(author ?? '').trim();
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}
