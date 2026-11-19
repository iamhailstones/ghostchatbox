# GHOST CHAT BOX — accounts, sync and personal memory

This update preserves the existing GHOST CHAT BOX interface and Groq-powered assistant while adding Supabase email/password authentication, private conversation history, and per-user saved memories.

## Sign-in methods (v1.3.0)
Continue with Google / Apple / GitHub, email + password, forgot password, email verification, secure logout (this device or all devices), and conversations + personal memory synced across devices. Everything is handled by Supabase Auth; the code is ready, but each provider must be switched on in the Supabase dashboard.

### One-time Supabase setup
1. **Authentication → URL Configuration**
   - Site URL: your main public URL (e.g. `https://ghostchatbox.onrender.com`).
   - Redirect URLs: add every origin that serves the app (Render, Vercel, `http://localhost:3000`), each with a trailing `/**`.
2. **Authentication → Providers** — enable each one and use this callback URL in the provider's console:
   `https://yvxobnbctiurdlywqolr.supabase.co/auth/v1/callback`
   - **Google**: Google Cloud Console → OAuth client (Web) → paste Client ID/Secret into Supabase.
   - **GitHub**: GitHub → Settings → Developer settings → OAuth Apps → paste Client ID/Secret.
   - **Apple**: needs an Apple Developer account. Create a Services ID, a Sign in with Apple key, then generate the client secret (a JWT) and paste it into Supabase. Apple secrets expire (max 6 months), so set a reminder to renew.
3. **Authentication → Providers → Email**: turn on **Confirm email**. Optional: raise the minimum password length to 8.
4. **Authentication → SMTP Settings**: configure your own SMTP (Resend, Postmark, etc.). Supabase's built-in mailer is heavily rate-limited and only for testing.
5. **Authentication → Email Templates**: customise the Confirm signup and Reset password emails if you like (keep the `{{ .ConfirmationURL }}` link).

### How it behaves
- Unverified email accounts cannot use the app; the server also rejects their API calls (403 `email_unverified`).
- Password reset and verification links use PKCE: open them in the same browser you requested them from. If a link fails, request a new one.
- After a password reset, all other sessions are signed out.
- Logout clears local state on the device. "Log out of all devices" revokes every session.
- The Personal memory panel (sidebar) lists, adds and deletes memories; typing `remember ...` in chat also saves one.
- `/api/chat` still works without a login for backwards compatibility; saved conversations and memories always require a verified account.

## Existing services
- Frontend/backend domain: `https://ghostchatbox.onrender.com`
- Existing Vercel frontend can continue pointing to its current deployment, but this package is configured to serve the same app from the Render service's `public/` directory. Deploy the updated repository to Render and point the Vercel project at the updated frontend files if you continue using Vercel for the public site.

## Render environment variables
Set these in Render → ghostchatbox → Environment:

- `GROQ_API_KEY` — existing Groq key
- `GROQ_MODEL` — existing model (optional; defaults to `openai/gpt-oss-120b`)
- `SUPABASE_URL=https://yvxobnbctiurdlywqolr.supabase.co`
- `SUPABASE_SECRET_KEY` — current Supabase server secret key (server only)
- `SUPABASE_PUBLISHABLE_KEY` — browser publishable key (not secret)
- `SUPABASE_JWKS_URL=https://yvxobnbctiurdlywqolr.supabase.co/auth/v1/.well-known/jwks.json`

Never put `SUPABASE_SECRET_KEY` or `GROQ_API_KEY` in frontend files or commit them to GitHub. The secret key shared in chat should be rotated in Supabase and the replacement stored only in Render.

## Database
The project expects these tables in Supabase: `conversations`, `messages`, and `memories`, with the columns and RLS policies created by the SQL script previously run in the Supabase SQL Editor. The backend uses the secret key server-side and verifies each user's Supabase access token before accessing account data.

## Deploy
1. Replace the existing repository files with the contents of this package (keep the `.git` directory out of the upload).
2. Commit and push to the existing GitHub repository.
3. Render should redeploy using `npm install` and `npm start` (`node server.js`).
4. Confirm `https://ghostchatbox.onrender.com/api/health` returns `{ "ok": true }`.
5. Ensure the public frontend deployment serves the `public/` directory. If using the existing Vercel project, configure its output directory as `public` and redeploy.

## Notes
- Supabase Auth email confirmation behavior is controlled in Supabase Authentication settings.
- Conversation history and memories are isolated by authenticated user ID.
- The browser only contains the Supabase publishable key. The Supabase secret and Groq keys remain on the server.
