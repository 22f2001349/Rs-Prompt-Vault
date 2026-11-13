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
