# Prompt Vault: Backup & Restore Upgrade

## Update your existing GitHub website (recommended)

Copy the **four** updated files from this ZIP into the **root** of your GitHub repository `22f2001349/Rs-Prompt-Vault`:

- `index.html`
- `app.js`
- `utils.js`
- `styles.css`

Commit the changes. GitHub Pages will publish the updated website at:

https://22f2001349.github.io/Rs-Prompt-Vault/

**Do not delete or replace your existing Supabase data.** No changes to SQL tables, authentication settings, or `config.js` are required.

## Usage

After login, tap **Download backup** to create `prompt-vault-backup-YYYY-MM-DD.json` containing all your prompts and their complete content. Check your device's Downloads directory to confirm it saved successfully.

Tap **Restore backup**, select your saved JSON, and confirm the import. Existing prompt IDs are skipped; missing prompts are added to your account. It never deletes or overwrites any existing prompt.

A restore can be resumed by selecting the same backup file again if any batch fails. A restore will only work when Supabase is online and your user is authenticated.

**Security:** A backup file contains your private prompt text, unencrypted. Store it securely; **never upload the backup JSON to a public GitHub repository**.
