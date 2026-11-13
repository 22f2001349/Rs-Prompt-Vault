# Prompt Vault: Complete source code (HTML, CSS, JavaScript)

Static frontend: HTML/CSS/vanilla JS. Supabase SQL is included for private cloud persistence. No React, npm, or build step.

## Folder structure

```text
prompt-vault/
  .gitignore
  README.md
  app.js
  config.js
  favicon.svg
  index.html
  styles.css
  supabase/schema.sql
  tests/utils.test.js
  utils.js
```

## `.gitignore`

```text
.DS_Store
Thumbs.db
*.log
.idea/
.vscode/

```

## `README.md`

```markdown
# Prompt Vault (Vanilla HTML / CSS / JavaScript)

A private, responsive prompt library with email/password login, PostgreSQL storage, one-click copy, and instant search. **No React, Vite, npm, bundling, or server is needed for the website.** GitHub Pages serves the files directly. Supabase supplies authentication and the database.

## First-time setup

1. Create a free [Supabase](https://supabase.com/) project.
2. Open its SQL Editor and run **all of `supabase/schema.sql`**. This creates the `prompts` table, timestamps, indexes, and all four Row Level Security (RLS) policies.
3. In **Authentication → Users**, create your one approved user with an email and password. Then, under Authentication settings, **turn off "Allow new users to sign up"**. Do not rely on the missing signup button alone. Keep anonymous sign-ins disabled. Set your project's authentication Site URL to your GitHub Pages URL if you plan to use auth emails.
4. In Supabase's project settings, copy your **Project URL** and **publishable key** (or legacy **anon key**). Edit the two placeholder values in `config.js`.
5. Upload the entire folder to a GitHub repository. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`. GitHub Pages works without an npm build command.
6. Open the published HTTPS URL and sign in using the existing Supabase user. Your prompts will be stored in PostgreSQL, not the browser's localStorage.

## Local testing

Open `index.html` through a local static-file server, such as the **Live Server** extension in VS Code. The published GitHub Pages URL uses HTTPS, which allows the Clipboard API to work. You may also use `python3 -m http.server 8000` for previewing, though Python is not part of the website.

Optional test commands (requires Node.js **only for running tests**, not for the website):

```sh
node --test tests/utils.test.js
node --check app.js
node --check utils.js
```

## Files

- `index.html` – Complete markup and accessible dialogs
- `styles.css` – All responsive styling
- `app.js` – Authentication, fetching, editing, deletion, copying, and UI logic
- `utils.js` – Text preview, filtering, validation, sorting
- `config.js` – Public Supabase project URL and **publishable/anon** key only
- `supabase/schema.sql` – Database schema and security policies
- `tests/utils.test.js` – Dependency-free helper tests (optional)

## Security notes

- `config.js` is publicly downloadable because static-site JavaScript is public. That is **normal for Supabase publishable/anon keys**. The key is not a secret, and cannot replace RLS policies. **Never paste a `service_role` or `sb_secret_...` key in a website file.**
- RLS restricts each authenticated user to rows where `user_id = auth.uid()`. Anonymous visitors have no table grants. Disabling public signup prevents arbitrary new users from creating accounts, but does not revoke access from other *existing* Supabase users; remove any unauthorized users in Supabase Authentication.
- The login session is persisted by Supabase's auth SDK. Prompt content is **never cached as your primary store** in localStorage. If you require absolute durability, maintain backups in Supabase as well. Cloud services can still experience outages or accidental deletion.
- Prompt titles and text are rendered using `textContent`, not `innerHTML`, preventing prompt text from injecting HTML or scripts.
- Clipboard copying requires HTTPS or localhost and browser permission. The UI reports success only after `navigator.clipboard.writeText` resolves.
- Dependence on a CDN means the user needs network access to load the Supabase browser SDK.

```

## `app.js`

```javascript
/* Prompt Vault: browser-only application using Supabase Auth + Postgres. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const utils = window.PromptVaultUtils;
  const view = {
    startup: $('startup'), login: $('login-screen'), dashboard: $('dashboard'),
    loginForm: $('login-form'), loginError: $('login-error'), loginSubmit: $('login-submit'),
    email: $('email'), password: $('password'), accountEmail: $('account-email'),
    logoutButton: $('logout-button'), search: $('search-input'),
    promptCount: $('prompt-count'), resultCount: $('result-count'),
    list: $('prompt-list'), listLoading: $('list-loading'),
    listError: $('list-error'), listErrorMessage: $('list-error-message'),
    empty: $('empty-state'), emptyHeading: $('empty-heading'),
    emptyDescription: $('empty-description'), emptyAddButton: $('empty-add-button'),
    addButton: $('add-button'), retryButton: $('retry-button'),
    editorDialog: $('editor-dialog'), editorForm: $('editor-form'),
    editorHeading: $('editor-heading'), title: $('prompt-title'),
    content: $('prompt-content'), characterCount: $('character-count'),
    editorError: $('editor-error'), editorSave: $('editor-save'),
    editorCancel: $('editor-cancel'), editorClose: $('editor-close'),
    detailDialog: $('detail-dialog'), detailTitle: $('detail-title'),
    detailMeta: $('detail-meta'), detailContent: $('detail-content'),
    detailCopy: $('detail-copy'), detailEdit: $('detail-edit'), detailClose: $('detail-close'),
    deleteDialog: $('delete-dialog'), deleteName: $('delete-name'),
    deleteError: $('delete-error'), deleteCancel: $('delete-cancel'),
    deleteConfirm: $('delete-confirm'), toast: $('toast')
  };

  const state = {
    client: null, userId: null, prompts: [], listBusy: false,
    listError: null, fetchSequence: 0,
    editingId: null, editorInitial: null, saving: false,
    detailId: null, deletingId: null, deleting: false,
    toastTimer: null
  };

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function showError(node, message) {
    node.textContent = message;
    node.hidden = false;
  }

  function clearError(node) {
    node.textContent = '';
    node.hidden = true;
  }

  function readableError(error, fallback = 'Something went wrong. Please try again.') {
    const message = typeof error === 'string' ? error
      : (error && typeof error.message === 'string' ? error.message : '');
    // Avoid dumping detailed connection internals to the user unnecessarily.
    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Connection failed. Check your internet connection and try again.';
    }
    return message || fallback;
  }

  function toast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    view.toast.textContent = message;
    view.toast.classList.toggle('toast-error', isError);
    view.toast.hidden = false;
    state.toastTimer = window.setTimeout(() => { view.toast.hidden = true; }, 3500);
  }

  function showConfigurationFailure(message) {
    view.startup.replaceChildren();
    const box = make('div', 'startup-error');
    box.append(make('h2', '', 'One-time setup needed'), make('p', '', message));
    view.startup.append(box);
  }

  function validConfig(config) {
    if (!config || typeof config.supabaseUrl !== 'string' ||
        typeof config.supabasePublishableKey !== 'string') return false;
    try {
      const url = new URL(config.supabaseUrl);
      return url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') &&
        !config.supabaseUrl.includes('YOUR-PROJECT') &&
        Boolean(config.supabasePublishableKey.trim()) &&
        !config.supabasePublishableKey.includes('YOUR-PUBLISHABLE');
    } catch { return false; }
  }

  function closeAllDialogs() {
    for (const dialog of [view.editorDialog, view.detailDialog, view.deleteDialog]) {
      if (dialog.open) dialog.close();
    }
    state.editingId = null;
    state.editorInitial = null;
    state.detailId = null;
    state.deletingId = null;
  }

  function applySession(session) {
    const nextId = session?.user?.id ?? null;
    if (nextId === state.userId && view.startup.hidden) return;

    state.userId = nextId;
    state.fetchSequence += 1;
    state.prompts = [];
    state.listBusy = false;
    state.listError = null;
    closeAllDialogs();
    view.startup.hidden = true;
    view.login.hidden = Boolean(nextId);
    view.dashboard.hidden = !nextId;
    view.password.value = '';
    clearError(view.loginError);

    if (nextId) {
      view.accountEmail.textContent = session?.user?.email ?? 'Signed in';
      view.search.value = '';
      renderList();
      void loadPrompts();
    } else {
      view.accountEmail.textContent = '';
      view.list.replaceChildren();
      view.email.focus();
    }
  }

  async function loadPrompts() {
    if (!state.userId || state.listBusy) return;
    const userId = state.userId;
    const seq = ++state.fetchSequence;
    state.listBusy = true;
    state.listError = null;
    renderList();

    try {
      const all = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await state.client
          .from('prompts')
          .select('id,user_id,title,content,created_at,updated_at')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (seq !== state.fetchSequence || userId !== state.userId) return;
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      state.prompts = utils.sortedByUpdate(all);
    } catch (error) {
      if (seq !== state.fetchSequence || userId !== state.userId) return;
      state.listError = readableError(error, 'Could not load saved prompts.');
    } finally {
      if (seq === state.fetchSequence && userId === state.userId) {
        state.listBusy = false;
        renderList();
      }
    }
  }

  function markListChanged() {
    state.fetchSequence += 1; // Ignore any stale fetch that started before this mutation.
    state.listBusy = false;
    state.listError = null;
    state.prompts = utils.sortedByUpdate(state.prompts);
    renderList();
  }

  function cardFor(prompt) {
    const card = make('article', 'prompt-card');
    const openButton = make('button', 'prompt-open');
    openButton.type = 'button';
    openButton.setAttribute('aria-label', `Open complete prompt: ${prompt.title}`);

    const top = make('div', 'card-top');
    top.append(make('span', 'card-symbol', '✦'), make('span', 'card-date', formatDate(prompt.updated_at)));
    openButton.append(top, make('h3', 'card-title', prompt.title),
      make('p', 'card-preview', utils.preview(prompt.content)));
    openButton.addEventListener('click', () => openDetail(prompt.id));

    const bottom = make('div', 'card-actions');
    const copy = make('button', 'button button-copy', 'Copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', `Copy complete prompt: ${prompt.title}`);
    copy.addEventListener('click', () => { void copyFullPrompt(prompt, copy, 'Copy'); });

    const edit = make('button', 'button button-text', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit prompt: ${prompt.title}`);
    edit.addEventListener('click', () => openEditor(prompt.id));

    const remove = make('button', 'button button-text button-delete-text', 'Delete');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Delete prompt: ${prompt.title}`);
    remove.addEventListener('click', () => openDelete(prompt.id));
    bottom.append(copy, edit, remove);
    card.append(openButton, bottom);
    return card;
  }

  function renderList() {
    if (!state.userId) return;
    const query = view.search.value;
    view.promptCount.textContent = String(state.prompts.length);
    view.listLoading.hidden = !state.listBusy;
    view.listError.hidden = !state.listError;
    view.listErrorMessage.textContent = state.listError || '';

    if (state.listBusy || state.listError) {
      view.list.replaceChildren();
      view.empty.hidden = true;
      view.resultCount.textContent = '';
      return;
    }

    const matches = state.prompts.filter((prompt) => utils.matchesSearch(prompt, query));
    view.resultCount.textContent = query.trim()
      ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}`
      : `${state.prompts.length} saved`;

    const fragment = document.createDocumentFragment();
    for (const prompt of matches) fragment.append(cardFor(prompt));
    view.list.replaceChildren(fragment);
    view.empty.hidden = matches.length > 0;

    if (!matches.length && query.trim()) {
      view.emptyHeading.textContent = 'No matching prompts.';
      view.emptyDescription.textContent = 'Try another keyword. Search checks the full text, not just card previews.';
      view.emptyAddButton.hidden = true;
    } else if (!matches.length) {
      view.emptyHeading.textContent = 'Your vault is ready.';
      view.emptyDescription.textContent = 'Add your first prompt to start building a library you can rely on.';
      view.emptyAddButton.hidden = false;
    }
  }

  function formatDate(value) {
    if (!value) return 'Saved';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Saved';
    return `Updated ${new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', year:'numeric'}).format(date)}`;
  }

  function promptById(id) { return state.prompts.find((row) => row.id === id); }

  async function copyFullPrompt(prompt, button, originalLabel) {
    if (!state.userId || prompt.user_id !== state.userId) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable. Open this website using HTTPS or localhost.');
      }
      await navigator.clipboard.writeText(prompt.content); // Exact original text, never preview().
      if (!state.userId || prompt.user_id !== state.userId) return;
      button.textContent = 'Copied ✓';
      toast('Complete prompt copied to clipboard.');
      window.setTimeout(() => { if (button.isConnected) button.textContent = originalLabel; }, 1800);
    } catch (error) {
      toast(readableError(error, 'Clipboard permission denied. Please allow clipboard access.'), true);
    }
  }

  function openDetail(id) {
    const prompt = promptById(id);
    if (!prompt) return;
    state.detailId = id;
    view.detailTitle.textContent = prompt.title;
    view.detailMeta.textContent = formatDate(prompt.updated_at);
    view.detailContent.textContent = prompt.content; // Plain text, never innerHTML.
    view.detailCopy.textContent = 'Copy complete prompt';
    view.detailDialog.showModal();
  }

  function editorHasUnsavedChanges() {
    const current = [view.title.value, view.content.value];
    return JSON.stringify(current) !== JSON.stringify(state.editorInitial);
  }

  function closeEditorWithConfirmation() {
    if (state.saving) return;
    if (editorHasUnsavedChanges() && !window.confirm('Discard your unsaved changes?')) return;
    view.editorDialog.close();
    state.editingId = null;
    state.editorInitial = null;
  }

  function openEditor(id = null) {
    if (!state.userId) return;
    const prompt = id ? promptById(id) : null;
    if (id && !prompt) return;
    if (view.detailDialog.open) view.detailDialog.close();
    state.detailId = null;
    state.editingId = id;
    view.editorHeading.textContent = id ? 'Edit prompt' : 'New prompt';
    view.title.value = prompt?.title ?? '';
    view.content.value = prompt?.content ?? '';
    view.editorSave.textContent = id ? 'Save changes' : 'Save prompt';
    view.editorInitial = [view.title.value, view.content.value];
    view.characterCount.textContent = `${view.content.value.length.toLocaleString()} characters`;
    clearError(view.editorError);
    view.editorDialog.showModal();
    view.title.focus();
  }

  function setSaving(busy) {
    state.saving = busy;
    view.editorSave.disabled = busy;
    view.editorCancel.disabled = busy;
    view.editorClose.disabled = busy;
    view.editorSave.textContent = busy ? 'Saving…' : (state.editingId ? 'Save changes' : 'Save prompt');
  }

  async function savePrompt(event) {
    event.preventDefault();
    if (state.saving || !state.userId) return;
    const userId = state.userId;
    const editingId = state.editingId;
    const title = view.title.value.trim();
    const content = view.content.value; // Never trim nonempty prompt body; preserve every character.
    const validation = utils.validatePrompt(title, content);
    if (validation) return showError(view.editorError, validation);
    clearError(view.editorError);
    setSaving(true);

    try {
      let result;
      if (editingId) {
        result = await state.client.from('prompts')
          .update({ title, content })
          .eq('id', editingId).eq('user_id', userId)
          .select('id,user_id,title,content,created_at,updated_at').maybeSingle();
      } else {
        result = await state.client.from('prompts')
          .insert({ user_id: userId, title, content })
          .select('id,user_id,title,content,created_at,updated_at').maybeSingle();
      }
      if (result.error) throw result.error;
      if (!result.data) throw new Error('The database did not confirm the save. Please try again.');
      if (userId !== state.userId) return;

      if (editingId) {
        state.prompts = state.prompts.map((row) => row.id === editingId ? result.data : row);
      } else {
        state.prompts.push(result.data);
      }
      view.editorDialog.close();
      state.editingId = null;
      state.editorInitial = null;
      markListChanged();
      toast(editingId ? 'Prompt updated successfully.' : 'Prompt saved to your vault.');
    } catch (error) {
      if (userId === state.userId) showError(view.editorError, readableError(error, 'Unable to save. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  function openDelete(id) {
    const prompt = promptById(id);
    if (!prompt) return;
    state.deletingId = id;
    view.deleteName.textContent = prompt.title;
    clearError(view.deleteError);
    view.deleteDialog.showModal();
  }

  function setDeleting(busy) {
    state.deleting = busy;
    view.deleteConfirm.disabled = busy;
    view.deleteCancel.disabled = busy;
    view.deleteConfirm.textContent = busy ? 'Deleting…' : 'Delete permanently';
  }

  async function deletePrompt() {
    if (state.deleting || !state.deletingId || !state.userId) return;
    const userId = state.userId;
    const id = state.deletingId;
    setDeleting(true);
    clearError(view.deleteError);
    try {
      const { data, error } = await state.client.from('prompts')
        .delete().eq('id', id).eq('user_id', userId)
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The database did not confirm deletion. Please try again.');
      if (userId !== state.userId) return;
      state.prompts = state.prompts.filter((row) => row.id !== id);
      view.deleteDialog.close();
      state.deletingId = null;
      markListChanged();
      toast('Prompt deleted successfully.');
    } catch (error) {
      if (userId === state.userId) showError(view.deleteError, readableError(error, 'Could not delete.'));
    } finally {
      setDeleting(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    clearError(view.loginError);
    const email = view.email.value.trim();
    const password = view.password.value;
    if (!email || !view.email.validity.valid || !password) {
      return showError(view.loginError, 'Enter a valid email address and password.');
    }
    view.loginSubmit.disabled = true;
    view.loginSubmit.textContent = 'Signing in…';
    try {
      const { data, error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('No session was returned. Please try again.');
      applySession(data.session);
    } catch (error) {
      showError(view.loginError, readableError(error, 'Unable to sign in.'));
    } finally {
      view.loginSubmit.disabled = false;
      view.loginSubmit.textContent = 'Sign in to your vault';
    }
  }

  async function logout() {
    view.logoutButton.disabled = true;
    view.logoutButton.textContent = 'Signing out…';
    try {
      const { error } = await state.client.auth.signOut();
      if (error) throw error;
      applySession(null);
    } catch (error) {
      toast(readableError(error, 'Could not sign out.'), true);
    } finally {
      view.logoutButton.disabled = false;
      view.logoutButton.textContent = 'Log out';
    }
  }

  function wireEvents() {
    view.loginForm.addEventListener('submit', (event) => { void login(event); });
    view.logoutButton.addEventListener('click', () => { void logout(); });
    view.addButton.addEventListener('click', () => openEditor());
    view.emptyAddButton.addEventListener('click', () => openEditor());
    view.search.addEventListener('input', renderList);
    view.retryButton.addEventListener('click', () => { void loadPrompts(); });

    view.editorForm.addEventListener('submit', (event) => { void savePrompt(event); });
    view.editorCancel.addEventListener('click', closeEditorWithConfirmation);
    view.editorClose.addEventListener('click', closeEditorWithConfirmation);
    view.content.addEventListener('input', () => {
      view.characterCount.textContent = `${view.content.value.length.toLocaleString()} characters`;
    });
    view.editorDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeEditorWithConfirmation();
    });

    view.detailClose.addEventListener('click', () => view.detailDialog.close());
    view.detailCopy.addEventListener('click', () => {
      const prompt = promptById(state.detailId);
      if (prompt) void copyFullPrompt(prompt, view.detailCopy, 'Copy complete prompt');
    });
    view.detailEdit.addEventListener('click', () => {
      if (state.detailId) openEditor(state.detailId);
    });

    view.deleteCancel.addEventListener('click', () => {
      if (!state.deleting) view.deleteDialog.close();
    });
    view.deleteDialog.addEventListener('cancel', (event) => {
      if (state.deleting) event.preventDefault();
    });
    view.deleteConfirm.addEventListener('click', () => { void deletePrompt(); });

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.userId) {
        event.preventDefault();
        if (!view.editorDialog.open && !view.detailDialog.open && !view.deleteDialog.open) view.search.focus();
      }
    });
  }

  function start() {
    if (!utils) return showConfigurationFailure('utils.js could not be loaded.');
    const config = window.PROMPT_VAULT_CONFIG;
    if (!validConfig(config)) {
      return showConfigurationFailure('Open config.js and replace both placeholders with your Supabase Project URL and publishable/anon key.');
    }
    if (!window.supabase?.createClient) {
      return showConfigurationFailure('The Supabase JavaScript CDN did not load. Check your internet connection or content blockers, then refresh.');
    }

    try {
      state.client = window.supabase.createClient(
        config.supabaseUrl,
        config.supabasePublishableKey,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
      );
    } catch (error) {
      return showConfigurationFailure(readableError(error, 'Could not connect to Supabase.'));
    }
    wireEvents();

    let receivedAuthState = false;
    state.client.auth.onAuthStateChange((_event, session) => {
      receivedAuthState = true;
      // Keep the Auth callback synchronous; defer UI/data work to a microtask.
      queueMicrotask(() => applySession(session));
    });
    state.client.auth.getSession().then(({ data, error }) => {
      if (receivedAuthState) return;
      if (error) toast(readableError(error, 'Could not restore your session.'), true);
      applySession(data?.session ?? null);
    }).catch((error) => {
      if (!receivedAuthState) {
        applySession(null);
        toast(readableError(error, 'Could not restore your session.'), true);
      }
    });
  }

  start();
})();

```

## `config.js`

```javascript
// This file is public on GitHub Pages. Use ONLY the Supabase public publishable/anon key.
// NEVER enter the Supabase service_role key, secret key, or your password here.
window.PROMPT_VAULT_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabasePublishableKey: 'YOUR-PUBLISHABLE-OR-ANON-KEY'
};

```

## `favicon.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="2" y="2" width="60" height="60" rx="15" fill="#252d52"/><path d="M32 9l6.7 16.3L55 32l-16.3 6.7L32 55l-6.7-16.3L9 32l16.3-6.7z" fill="#c3b6ff"/></svg>

```

## `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#f6f8fc" />
    <meta name="description" content="A private home for the prompts you want to use again." />
    <title>Prompt Vault | Your ideas, ready to use.</title>
    <link rel="icon" type="image/svg+xml" href="favicon.svg" />
    <link rel="stylesheet" href="styles.css" />
    <script src="config.js" defer></script>
    <script src="utils.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script>
    <script src="app.js" defer></script>
  </head>
  <body>
    <div id="startup" class="startup" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>Opening your vault…</p>
    </div>

    <main id="login-screen" class="login-screen" hidden>
      <div class="login-brand"><span class="brand-mark" aria-hidden="true">✦</span> Prompt Vault</div>
      <section class="login-panel" aria-labelledby="login-heading">
        <div class="login-icon" aria-hidden="true">✦</div>
        <p class="eyebrow">YOUR PRIVATE WORKSPACE</p>
        <h1 id="login-heading">Welcome back.</h1>
        <p class="supporting">Your best prompts, safely stored and always ready when inspiration strikes.</p>
        <form id="login-form" novalidate>
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" autocomplete="username" inputmode="email" placeholder="you@example.com" required />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required />
          <p id="login-error" class="form-error" role="alert" hidden></p>
          <button id="login-submit" class="button button-primary login-submit" type="submit">Sign in to your vault</button>
        </form>
        <p class="login-footnote">Private by design. No public registration.</p>
      </section>
      <p class="login-bottom">Built for thoughts worth keeping.</p>
    </main>

    <div id="dashboard" class="dashboard" hidden>
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="./" aria-label="Prompt Vault home"><span class="brand-mark" aria-hidden="true">✦</span><span>Prompt Vault</span></a>
          <div class="account-area">
            <span id="account-email" class="account-email"></span>
            <button id="logout-button" type="button" class="button button-outline button-small">Log out</button>
          </div>
        </div>
      </header>

      <main class="page">
        <section class="hero" aria-labelledby="hero-heading">
          <div class="hero-copy">
            <p class="eyebrow hero-eyebrow"><span class="eyebrow-dot"></span> YOUR PERSONAL LIBRARY</p>
            <h1 id="hero-heading">Good prompts deserve<br /><em>a permanent home.</em></h1>
            <p>Keep your most useful instructions in one place. Find any idea, then copy the full prompt in one click.</p>
          </div>
          <div class="hero-decoration" aria-hidden="true"><div class="hero-orbit orbit-1"></div><div class="hero-orbit orbit-2"></div><div class="hero-star">✦</div></div>
        </section>

        <section class="library" aria-labelledby="library-heading">
          <div class="library-title-row">
            <div>
              <p class="eyebrow muted-eyebrow">YOUR COLLECTION</p>
              <h2 id="library-heading">All prompts <span id="prompt-count" class="count-bubble">0</span></h2>
            </div>
            <button type="button" id="add-button" class="button button-primary"><span class="add-plus" aria-hidden="true">+</span> Add prompt</button>
          </div>
          <div class="toolbar">
            <label class="search-field" for="search-input"><span class="search-icon" aria-hidden="true">⌕</span><input id="search-input" type="search" autocomplete="off" placeholder="Search titles and complete prompts…" aria-label="Search prompts" /><span class="search-shortcut" aria-hidden="true">⌘ K</span></label>
            <span id="result-count" class="result-count" aria-live="polite"></span>
          </div>
          <div id="list-error" class="list-error" role="alert" hidden><p id="list-error-message">Unable to load prompts.</p><button id="retry-button" type="button" class="button button-outline button-small">Try again</button></div>
          <div id="list-loading" class="list-loading" role="status" hidden><div class="spinner" aria-hidden="true"></div> Loading saved prompts…</div>
          <div id="prompt-list" class="prompt-list"></div>
          <div id="empty-state" class="empty-state" hidden><div class="empty-icon" aria-hidden="true">✦</div><h3 id="empty-heading">Your vault is ready.</h3><p id="empty-description">Add your first prompt to start building a library you can rely on.</p><button id="empty-add-button" type="button" class="button button-secondary">+ Create a prompt</button></div>
        </section>
        <footer class="footer"><span>Prompt Vault</span><span>Your words stay yours.</span></footer>
      </main>
    </div>

    <dialog id="editor-dialog" class="modal" aria-labelledby="editor-heading">
      <div class="modal-heading-row"><div><p class="eyebrow muted-eyebrow">PROMPT EDITOR</p><h2 id="editor-heading">New prompt</h2></div><button id="editor-close" type="button" class="icon-button" aria-label="Close editor">×</button></div>
      <form id="editor-form" novalidate>
        <label for="prompt-title">Title <span class="required">*</span></label>
        <input id="prompt-title" type="text" maxlength="160" placeholder="e.g. Master Quantitative Aptitude" required />
        <div class="label-row"><label for="prompt-content">Complete prompt <span class="required">*</span></label><span id="character-count" class="character-count">0 characters</span></div>
        <textarea id="prompt-content" rows="13" spellcheck="true" placeholder="Paste your complete prompt here. Line breaks, paragraphs, and long instructions will be preserved." required></textarea>
        <p id="editor-error" class="form-error" role="alert" hidden></p>
        <div class="modal-actions"><button id="editor-cancel" type="button" class="button button-outline">Cancel</button><button id="editor-save" type="submit" class="button button-primary">Save prompt</button></div>
      </form>
    </dialog>

    <dialog id="detail-dialog" class="modal modal-wide" aria-labelledby="detail-title">
      <div class="modal-heading-row"><div class="detail-title-wrap"><p class="eyebrow muted-eyebrow">SAVED PROMPT</p><h2 id="detail-title"></h2><p id="detail-meta" class="detail-meta"></p></div><button id="detail-close" type="button" class="icon-button" aria-label="Close prompt">×</button></div>
      <div id="detail-content" class="detail-content" tabindex="0"></div>
      <div class="modal-actions"><button id="detail-edit" type="button" class="button button-outline">Edit prompt</button><button id="detail-copy" type="button" class="button button-primary">Copy complete prompt</button></div>
    </dialog>

    <dialog id="delete-dialog" class="modal modal-narrow" aria-labelledby="delete-heading">
      <div class="delete-icon" aria-hidden="true">!</div>
      <h2 id="delete-heading">Delete this prompt?</h2>
      <p class="supporting">“<span id="delete-name"></span>” will be permanently removed from your vault. This action cannot be undone.</p>
      <p id="delete-error" class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button id="delete-cancel" type="button" class="button button-outline">Keep prompt</button><button id="delete-confirm" type="button" class="button button-danger">Delete permanently</button></div>
    </dialog>

    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  </body>
</html>

```

## `styles.css`

```css
:root {
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #202941;
  background: #f8f9fc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; min-width: 320px; }
button, input, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { opacity: .58; cursor: not-allowed; }
button:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible { outline: 3px solid #988de0; outline-offset: 3px; }
a { color: inherit; }
.startup { min-height: 100vh; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; color: #65708b; }
.spinner { width: 24px; height: 24px; border: 3px solid #e5e7f5; border-top-color: #5e58ad; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.startup-error { background: white; border: 1px solid #e7e8f0; padding: 30px; max-width: 460px; border-radius: 18px; margin: 20px; }
.startup-error h2 { margin: 0 0 10px; }
.startup-error p { line-height: 1.7; color: #667089; }
.button { border: 1px solid transparent; border-radius: 11px; padding: 11px 18px; font-weight: 660; font-size: 14px; transition: background .16s, transform .16s, box-shadow .16s; white-space: nowrap; }
.button:not(:disabled):active { transform: translateY(1px); }
.button-primary { color: #fff; background: #3c417e; box-shadow: 0 4px 12px rgba(45, 47, 98, .12); }
.button-primary:hover:not(:disabled) { background: #31366c; box-shadow: 0 6px 18px rgba(45,47,98,.18); }
.button-outline { color: #485373; background: white; border-color: #dce0eb; }
.button-outline:hover:not(:disabled) { background: #f4f5fa; }
.button-secondary { background: #eae8fa; color: #47427f; }
.button-secondary:hover:not(:disabled) { background: #dedcf5; }
.button-small { padding: 9px 14px; font-size: 12px; border-radius: 9px; }
.button-danger { color: #fff; background: #b43f50; }
.button-danger:hover:not(:disabled) { background: #942d3e; }
.brand-mark { width: 35px; height: 35px; display: inline-grid; place-items: center; border-radius: 10px; color: #ddd0ff; background: #313765; font-size: 23px; line-height: 1; }
.login-screen { position: relative; min-height: 100vh; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at 12% 14%, #ebe9fa 0, transparent 33%), radial-gradient(circle at 84% 80%, #eef0fa 0, transparent 36%), #f8f9fc; }
.login-brand { position: absolute; left: clamp(20px, 5vw, 70px); top: 27px; display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 750; letter-spacing: -.6px; }
.login-panel { width: 100%; max-width: 448px; background: #fff; border: 1px solid #e8e9f1; border-radius: 24px; padding: clamp(27px, 4vw, 45px); box-shadow: 0 24px 80px rgba(27,38,77,.07); margin: 66px 0; }
.login-icon { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 15px; background: #eeeafd; color: #665ba9; font-size: 33px; margin-bottom: 28px; }
.eyebrow { font-size: 10px; letter-spacing: .15em; color: #7770bd; font-weight: 780; margin: 0 0 11px; }
.login-panel h1 { font-size: clamp(27px, 4vw, 37px); margin: 0 0 10px; letter-spacing: -1.35px; }
.supporting { color: #718098; line-height: 1.7; margin: 0 0 29px; font-size: 14px; }
.login-panel form { display: flex; flex-direction: column; }
.login-panel label, .modal label { color: #414b67; font-size: 13px; font-weight: 675; margin-bottom: 9px; }
.login-panel input, .modal input, .modal textarea { border: 1px solid #dce1ed; border-radius: 10px; background: #fbfcff; padding: 13px 14px; color: #212c47; width: 100%; outline: none; transition: box-shadow .15s, border-color .15s; }
.login-panel input:focus, .modal input:focus, .modal textarea:focus { border-color: #7772b8; box-shadow: 0 0 0 3px rgba(124, 113, 194, .13); }
.login-panel input { margin-bottom: 21px; }
.login-submit { width: 100%; margin-top: 3px; padding: 14px; }
.form-error { color: #ae3446; background: #fff1f3; border: 1px solid #f4d3da; border-radius: 9px; padding: 10px 12px; font-size: 13px; margin: 0 0 12px; line-height: 1.5; overflow-wrap: anywhere; }
.login-footnote { margin: 23px 0 0; font-size: 12px; text-align: center; color: #8a91a2; }
.login-bottom { position: absolute; bottom: 18px; color: #9299a8; font-size: 12px; }
.topbar { background: rgba(255,255,255,.96); border-bottom: 1px solid #e9ebf3; }
.topbar-inner { width: min(1120px, calc(100% - 56px)); min-height: 80px; margin: auto; display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.brand { display: inline-flex; gap: 12px; align-items: center; text-decoration: none; font-size: 19px; letter-spacing: -.7px; font-weight: 780; }
.account-area { display: flex; align-items: center; gap: 17px; }
.account-email { font-size: 12px; color: #78829a; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page { width: min(1120px, calc(100% - 56px)); margin: 0 auto; }
.hero { background: linear-gradient(114deg, #303764, #414a7e 63%, #555b91); color: white; margin: 37px 0 48px; min-height: 292px; padding: clamp(30px, 4.4vw, 52px) clamp(28px, 5vw, 60px); border-radius: 23px; position: relative; overflow: hidden; display: flex; align-items: center; }
.hero-copy { position: relative; z-index: 1; max-width: 650px; }
.hero-eyebrow { color: #d3c6fa; display: flex; align-items: center; gap: 8px; }
.eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #bdb0fa; }
.hero h1 { font-size: clamp(29px, 4vw, 45px); letter-spacing: -1.8px; line-height: 1.18; font-weight: 720; margin: 0 0 17px; }
.hero h1 em { color: #cdc1ff; font-style: normal; }
.hero-copy > p:last-child { color: #d6d9ec; line-height: 1.68; font-size: 14px; max-width: 460px; margin: 0; }
.hero-decoration { position: absolute; width: 355px; height: 355px; right: -15px; top: -31px; opacity: .6; }
.hero-orbit { position: absolute; border: 1px solid #c9beff; border-radius: 50%; transform: rotate(-21deg); }
.orbit-1 { width: 275px; height: 275px; top: 45px; left: 40px; }
.orbit-2 { width: 210px; height: 210px; top: 77px; left: 72px; }
.hero-star { position: absolute; top: 115px; left: 130px; font-size: 97px; color: #c9bbff; }
.library-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.muted-eyebrow { color: #8b88ae; }
.library-title-row h2 { margin: 0; font-size: 27px; line-height: 1.15; letter-spacing: -1px; }
.count-bubble { display: inline-flex; vertical-align: middle; justify-content: center; align-items: center; font-size: 12px; min-width: 27px; height: 27px; margin-left: 6px; background: #e9e8f5; color: #605b8c; padding: 3px 7px; border-radius: 9px; letter-spacing: 0; }
.add-plus { font-size: 20px; font-weight: 400; margin-right: 4px; vertical-align: -1px; }
.toolbar { display: flex; align-items: center; gap: 20px; margin-bottom: 25px; }
.search-field { flex: 1; height: 53px; display: flex; align-items: center; gap: 12px; background: white; color: #8590aa; border: 1px solid #e0e4ed; border-radius: 12px; padding: 0 16px; box-shadow: 0 2px 10px rgba(25,35,70,.02); }
.search-field:focus-within { border-color: #8c85bf; box-shadow: 0 0 0 3px #eae7fb; }
.search-icon { font-size: 26px; line-height: 1; transform: rotate(-20deg); }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 14px; color: #293451; }
.search-field input::placeholder { color: #a4aabb; }
.search-shortcut { border: 1px solid #e4e7ef; color: #9da5b6; font-size: 11px; padding: 4px 6px; border-radius: 5px; white-space: nowrap; }
.result-count { font-size: 12px; color: #8e96a8; white-space: nowrap; }
.prompt-list { display: flex; flex-direction: column; gap: 15px; }
.prompt-card { border: 1px solid #e5e7ef; background: #fff; border-radius: 16px; box-shadow: 0 3px 12px rgba(35,42,89,.025); overflow: hidden; transition: border-color .16s, box-shadow .16s, transform .16s; }
.prompt-card:hover { border-color: #cecee8; box-shadow: 0 10px 26px rgba(38,48,95,.06); transform: translateY(-1px); }
.prompt-open { display: block; width: 100%; text-align: left; padding: 19px 23px 17px; color: inherit; background: transparent; border: 0; }
.card-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.card-symbol { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; color: #746cbb; background: #f0eefb; font-size: 18px; }
.card-date { font-size: 11px; color: #9aa2b1; }
.card-title { color: #252e4b; margin: 0 0 8px; font-weight: 730; font-size: 17px; letter-spacing: -.35px; overflow-wrap: anywhere; }
.card-preview { color: #777f94; margin: 0; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.card-actions { display: flex; align-items: center; gap: 6px; border-top: 1px solid #f0f1f6; padding: 10px 16px; }
.button-copy { color: #4c4691; border-color: #e6e3f9; background: #efedfd; padding: 8px 14px; font-size: 12px; }
.button-copy:hover:not(:disabled) { background: #e4e0fa; }
.button-text { padding: 8px 13px; font-size: 12px; background: transparent; color: #8a91a2; border: 0; }
.button-text:hover:not(:disabled) { background: #f3f4f8; color: #353f60; }
.button-delete-text { margin-left: auto; }
.button-delete-text:hover:not(:disabled) { color: #b43f50; background: #fff1f3; }
.empty-state { border: 1px dashed #d9dce9; background: white; border-radius: 18px; padding: 54px 25px; text-align: center; }
.empty-icon { margin: 0 auto 18px; width: 62px; height: 62px; border-radius: 19px; display: grid; place-items: center; background: #f1effe; font-size: 39px; color: #7169b6; }
.empty-state h3 { font-size: 21px; letter-spacing: -.5px; margin: 0 0 9px; }
.empty-state p { max-width: 390px; color: #8a93a7; margin: 0 auto 23px; font-size: 13px; line-height: 1.7; }
.list-error { padding: 22px; color: #a13d50; border: 1px solid #eed8de; background: #fff5f7; border-radius: 12px; }
.list-error p { margin: 0 0 11px; }
.list-loading { display: flex; align-items: center; justify-content: center; gap: 13px; color: #8e96a9; min-height: 200px; font-size: 14px; }
.footer { display: flex; justify-content: space-between; color: #a7adba; font-size: 12px; border-top: 1px solid #e9eaf2; margin: 60px 0 20px; padding-top: 21px; }
.modal { width: min(96vw, 650px); max-height: min(91vh, 950px); border: 1px solid #e7e9f2; border-radius: 20px; background: white; box-shadow: 0 28px 100px rgba(13,22,57,.26); color: #26314e; padding: 27px 30px; overflow-y: auto; }
.modal::backdrop { background: rgba(22,26,49,.54); backdrop-filter: blur(3px); }
.modal-wide { width: min(96vw, 810px); }
.modal-narrow { width: min(96vw, 440px); }
.modal-heading-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 26px; }
.modal-heading-row h2, .modal-narrow h2 { margin: 0; font-size: 25px; line-height: 1.25; letter-spacing: -.7px; overflow-wrap: anywhere; }
.icon-button { border: 1px solid #e9eaf3; background: #f7f8fb; border-radius: 10px; width: 35px; height: 35px; font-size: 26px; line-height: 1; color: #8590a6; flex-shrink: 0; }
.icon-button:hover { background: #eef0f8; color: #28334c; }
.modal form { display: flex; flex-direction: column; }
.modal input { margin-bottom: 21px; }
.modal textarea { min-height: 285px; resize: vertical; line-height: 1.7; font-family: inherit; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.required { color: #a74965; }
.label-row { display: flex; justify-content: space-between; gap: 15px; align-items: center; }
.character-count { color: #97a0b2; font-size: 11px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 9px; align-items: center; border-top: 1px solid #f0f1f7; margin-top: 24px; padding-top: 21px; }
.modal-actions .button { min-width: 107px; }
.detail-meta { margin: 11px 0 0; color: #929aaa; font-size: 12px; }
.detail-title-wrap { min-width: 0; }
.detail-content { max-height: min(52vh, 600px); overflow-y: auto; border: 1px solid #eceef5; border-radius: 12px; padding: 21px; background: #fbfcff; line-height: 1.7; font-size: 14px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; user-select: text; tab-size: 4; }
.delete-icon { display: grid; place-items: center; width: 47px; height: 47px; background: #fff0f2; color: #b43f50; border-radius: 14px; font-size: 23px; font-weight: 750; margin-bottom: 16px; }
.modal-narrow .supporting { margin: 13px 0 0; overflow-wrap: anywhere; }
.toast { position: fixed; right: 25px; bottom: 26px; background: #30375d; color: white; padding: 13px 20px; border-radius: 11px; box-shadow: 0 13px 40px rgba(21,26,59,.22); z-index: 30; font-size: 13px; max-width: min(400px, calc(100vw - 32px)); line-height: 1.55; }
.toast-error { background: #ad3c4d; }
@media (max-width: 700px) {
  .topbar-inner, .page { width: min(100% - 32px, 1120px); }
  .topbar-inner { min-height: 66px; }
  .account-area { gap: 8px; }
  .account-email { display: none; }
  .hero { margin: 20px 0 35px; min-height: 255px; padding: 31px 25px; }
  .hero-decoration { opacity: .21; right: -170px; }
  .hero h1 { letter-spacing: -1.2px; }
  .library-title-row h2 { font-size: 23px; }
  .toolbar { align-items: flex-start; flex-direction: column; gap: 8px; }
  .search-field { width: 100%; flex: none; }
  .result-count { margin-left: 2px; }
  .modal { padding: 22px 19px; }
  .detail-content { padding: 16px; }
}
@media (max-width: 420px) {
  .brand { font-size: 16px; gap: 7px; }
  .brand-mark { width: 30px; height: 30px; }
  .button-small { padding: 8px 11px; }
  .library-title-row { align-items: center; }
  .library-title-row .button-primary { padding: 10px 11px; font-size: 12px; }
  .search-shortcut { display: none; }
  .card-actions { padding: 9px 11px; }
  .button-text { padding: 8px 9px; }
  .modal-actions { flex-wrap: wrap; }
  .modal-actions .button { flex: 1; }
  .login-panel { padding: 25px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
}

```

## `supabase/schema.sql`

```sql
-- Run once in the Supabase SQL Editor, AFTER creating your Supabase project.
-- The browser uses the public publishable/anon key. RLS protects the records.

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  content text not null check (char_length(btrim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prompts_user_updated_idx
  on public.prompts (user_id, updated_at desc);

-- Update timestamp is assigned by Postgres, not trusted to client input.
create or replace function public.touch_prompt_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prompts_touch_updated_at on public.prompts;
create trigger prompts_touch_updated_at
before update on public.prompts
for each row execute function public.touch_prompt_updated_at();

alter table public.prompts enable row level security;

-- Anonymous visitors do not get SQL permission to view or modify prompt rows.
revoke all on table public.prompts from anon, authenticated;
grant select, insert, update, delete on table public.prompts to authenticated;

drop policy if exists "prompt_select_own" on public.prompts;
create policy "prompt_select_own" on public.prompts
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "prompt_insert_own" on public.prompts;
create policy "prompt_insert_own" on public.prompts
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "prompt_update_own" on public.prompts;
create policy "prompt_update_own" on public.prompts
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "prompt_delete_own" on public.prompts;
create policy "prompt_delete_own" on public.prompts
for delete to authenticated
using ((select auth.uid()) = user_id);

```

## `tests/utils.test.js`

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { preview, matchesSearch, validatePrompt, sortedByUpdate } = require('../utils.js');

test('shortens long content but not the original', () => {
  const original = 'Introduction\n' + 'a'.repeat(250) + '\nEnd';
  const result = preview(original);
  assert.ok(result.length <= 148);
  assert.ok(result.endsWith('...'));
  assert.equal(original.split('\n').length, 3);
});

test('searches the full content case-insensitively', () => {
  const row = { title: 'Quant reasoning', content: 'A'.repeat(200) + '\nYouTube lessons for Mixtures' };
  assert.equal(matchesSearch(row, 'youtube'), true);
  assert.equal(matchesSearch(row, 'QUANT'), true);
  assert.equal(matchesSearch(row, 'history'), false);
});

test('rejects empty and too long titles and empty content', () => {
  assert.ok(validatePrompt(' ', 'hello'));
  assert.ok(validatePrompt('title', '\n \t'));
  assert.ok(validatePrompt('a'.repeat(161), 'ok'));
  assert.equal(validatePrompt('One', 'line1\nline2'), null);
});

test('sorts by updated timestamp, newest first', () => {
  const rows = [
    {id:'a', updated_at:'2024-01-01T00:00:00Z'},
    {id:'b', updated_at:'2025-01-01T00:00:00Z'},
  ];
  assert.deepEqual(sortedByUpdate(rows).map(row=>row.id), ['b','a']);
  assert.deepEqual(rows.map(row=>row.id), ['a','b']);
});

```

## `utils.js`

```javascript
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

```

