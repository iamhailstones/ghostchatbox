# GHOST CHAT BOX — Supabase login and personal memory

This update preserves the existing GHOST CHAT BOX interface and Groq-powered assistant while adding Supabase email/password authentication, private conversation history, and per-user saved memories.

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
