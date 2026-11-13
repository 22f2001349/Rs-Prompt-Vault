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

  const helpers = { PREVIEW_LENGTH, preview, matchesSearch, validatePrompt, sortedByUpdate };
  root.PromptVaultUtils = helpers;
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
})(typeof window !== 'undefined' ? window : globalThis);
