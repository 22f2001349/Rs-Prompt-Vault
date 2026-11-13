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
