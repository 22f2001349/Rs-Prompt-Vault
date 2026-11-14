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

## Supabase configuration already included

This ZIP includes the project URL and **public** publishable key you supplied.
If you have already published an older version on GitHub Pages, replace the files
from this ZIP in your existing repository and commit them. GitHub Pages may take
a short time to publish the new version. Open `config.js` on your live website
to verify that it contains the correct Project URL (never expose a secret key).

## Troubleshooting the "Connection failed" message

Open `https://YOUR-USERNAME.github.io/YOUR-REPO/check-connection.html`
(replace username and repository name) to run a simple network check.
A successful check confirms the browser can contact the Supabase Auth health
endpoint; it does **not** verify email/password login, table policies, or SQL setup.
If the check fails, verify the project's Active status in Supabase, the Project URL,
and try a private/incognito window without extensions or VPN. Browser DevTools
Network tab gives more precise DNS/CORS errors.

Changing `config.js` does **not** configure Supabase for you: run `supabase/schema.sql`
and create your authorized user manually in the dashboard.

## Backup & Restore (no extra SQL required)

Once signed in, select **Download backup** to request a full JSON backup of all prompts owned by the active account. The export queries Supabase directly, paginates through all rows, includes each title and **complete original prompt body**, and preserves its timestamps. It does not export login sessions or keys. A filename such as `prompt-vault-backup-2026-11-13.json` is offered to your browser's Downloads manager. Check that the file actually appears in Downloads.

Choose **Restore backup** to select a valid Prompt Vault v1 JSON file. The app validates the file before writing anything, asks for confirmation, and **skips existing records with the same ID**. New records are assigned to whichever account is currently signed in. It never overwrites or deletes existing prompts. For a partial import failure, import the same file again to continue. Restore uses the same `prompts` table and existing RLS policies.

**Keep backup files private.** JSON backups contain your actual prompt text in readable form. Do not commit them to a public GitHub repository or share them. Save a copy outside your device (ideally an encrypted drive). Supabase is still the source of truth until a restore is completed.

No changes to `supabase/schema.sql`, authentication settings, or Supabase keys are needed.

## Updating an already working GitHub Pages installation

Replace only `index.html`, `app.js`, `utils.js`, and `styles.css` in the **root of your existing repository**, then commit. Your existing `config.js`, `supabase/schema.sql`, saved records, and login credentials do not change. Reload the GitHub Pages site to see the new backup controls.
