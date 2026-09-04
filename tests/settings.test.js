import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, pickDefaultModel } from '../lib/settings.js';

describe('settings', () => {
  it('ha i default di Ollama e del vault', () => {
    const s = mergeSettings(undefined);
    expect(s.endpointUrl).toBe('http://localhost:11434');
    expect(s.maxMessages).toBe(30);
    expect(s.obsidianUrl).toBe('http://127.0.0.1:27123');
    expect(s.obsidianApiKey).toBe('');
    expect(s.clientsFolder).toBe('📁 Clienti');
    expect(s.personalFolder).toBe('🌱 Personale/Corrispondenza');
    expect(s.inboxFolder).toBe('📥 Inbox');
    expect(s.personalPromisesFolder).toBe('🌱 Personale/Promesse');
    expect(s.pecAccountIds).toEqual([]);
    expect(s.tagVault).toBe('vault');
  });

  it('i valori salvati vincono sui default', () => {
    expect(mergeSettings({ model: 'granite4.1:8b', pecAccountIds: ['account3'] })).toMatchObject({ model: 'granite4.1:8b', pecAccountIds: ['account3'], clientsFolder: '📁 Clienti' });
    expect(DEFAULT_SETTINGS.model).toBe('');
  });

  it('sceglie il modello per preferenza ed evita qwen3', () => {
    expect(pickDefaultModel(['qwen3:4b', 'granite4.1:8b', 'gemma3:latest'])).toBe('granite4.1:8b');
    expect(pickDefaultModel(['qwen3:4b', 'gemma3:latest'])).toBe('gemma3:latest');
    expect(pickDefaultModel(['qwen3:4b', 'altro:1b'])).toBe('qwen3:4b');
    expect(pickDefaultModel([])).toBe('');
  });
});
