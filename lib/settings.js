export const DEFAULT_SETTINGS = {
  // Ollama (riassunto del thread)
  endpointUrl: 'http://localhost:11434',
  model: '',
  maxMessages: 30,
  // Obsidian Local REST API (salvataggio nel vault)
  obsidianUrl: 'http://127.0.0.1:27123',
  obsidianApiKey: '',
  clientsFolder: '📁 Clienti',
  personalFolder: '🌱 Personale/Corrispondenza',
  personalPromisesFolder: '🌱 Personale/Promesse',
  inboxFolder: '📥 Inbox',
  // Account che sono PEC: per questi l'originale .eml si salva sempre
  pecAccountIds: [],
  // Tag applicato in Thunderbird ai messaggi salvati nel vault
  tagVault: 'vault',
};

export function mergeSettings(stored) {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function getSettings(storageLocal) {
  const found = await storageLocal.get('settings');
  return mergeSettings(found.settings);
}

// Ordine di preferenza per il modello di default. qwen3 è escluso di proposito
// (thinking mode non disattivabile in modo affidabile → lento e JSON inaffidabile).
const PREFERITI = ['granite4', 'gemma3', 'llama3', 'qwen2.5'];

export function pickDefaultModel(models) {
  for (const p of PREFERITI) {
    const hit = models.find((m) => m.toLowerCase().startsWith(p));
    if (hit) return hit;
  }
  return models[0] ?? '';
}
