/* Small, dependency-free helpers shared by the browser app and its tests. */
(function (root) {
  'use strict';

  const PREVIEW_LENGTH = 145;

  function preview(content, limit = PREVIEW_LENGTH) {
    const condensed = String(content ?? '').replace(/\s+/g, ' ').trim();
    if (condensed.length <= limit) return condensed;
    return condensed.slice(0, limit).trimEnd() + '...';
  }

  function matchesSearch(prompt, searchText) {
    const term = String(searchText ?? '').trim().toLocaleLowerCase();
    if (!term) return true;
    return String(prompt.title ?? '').toLocaleLowerCase().includes(term)
      || String(prompt.content ?? '').toLocaleLowerCase().includes(term);
  }

  function validatePrompt(title, content) {
    if (!String(title ?? '').trim()) return 'Enter a title for your prompt.';
    if (String(title).trim().length > 160) return 'Keep the title within 160 characters.';
    if (!String(content ?? '').trim()) return 'Enter the full prompt before saving.';
    return null;
  }

  function sortedByUpdate(prompts) {
    return [...prompts].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at))
      || String(b.created_at).localeCompare(String(a.created_at))
      || String(b.id).localeCompare(String(a.id)));
  }

  // A portable, plain-text backup. Never export tokens, passwords, or user IDs.
  const BACKUP_FORMAT = 'prompt-vault-backup';
  const BACKUP_VERSION = 1;
  const MAX_BACKUP_ROWS = 50000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function makeBackup(prompts, exportedAt = new Date().toISOString()) {
    if (!Array.isArray(prompts)) throw new Error('Prompts are unavailable for backup.');
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: exportedAt,
      count: prompts.length,
      prompts: prompts.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at
      }))
    };
  }

  function readBackup(jsonText) {
    let parsed;
    try { parsed = JSON.parse(jsonText); } catch {
      throw new Error('This file is not valid JSON. Select a Prompt Vault backup.');
    }
    if (!parsed || parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.prompts)) {
      throw new Error('This is not a supported Prompt Vault backup (version 1).');
    }
    if (parsed.prompts.length > MAX_BACKUP_ROWS) throw new Error('The backup contains too many records to restore safely.');
    if (!Number.isSafeInteger(parsed.count) || parsed.count !== parsed.prompts.length) {
      throw new Error('The backup record count does not match its contents.');
    }
    const seen = new Set();
    return parsed.prompts.map((row, i) => {
      if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !UUID.test(row.id) ||
          typeof row.title !== 'string' || typeof row.content !== 'string' ||
          validatePrompt(row.title, row.content) !== null ||
          typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) ||
          typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) {
        throw new Error(`Backup has an invalid prompt at record ${i + 1}. No prompts were imported.`);
      }
      const id = row.id.toLowerCase();
      if (seen.has(id)) throw new Error('Backup contains duplicate prompt IDs. No prompts were imported.');
      seen.add(id);
      return {
        id,
        title: row.title,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    });
  }

  const helpers = { PREVIEW_LENGTH, preview, matchesSearch, validatePrompt, sortedByUpdate, makeBackup, readBackup };
  root.PromptVaultUtils = helpers;
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
})(typeof window !== 'undefined' ? window : globalThis);
