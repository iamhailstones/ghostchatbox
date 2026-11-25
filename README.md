# GHOST CHAT BOX

Public AI chat (no sign-in) powered by xAI Grok, hosted on Vercel.

Folder layout (keep it exactly like this):

    index.html          the chat page
    system-prompt.md    the AI's personality and knowledge
    vercel.json         tells Vercel to ship the prompt with the function
    api/chat.js         server function that talks to Grok (keeps the key private)

Deploy: push this folder to a GitHub repo, import it in Vercel, then add the
environment variable XAI_API_KEY (from console.x.ai) and redeploy.
Optional env var: GROK_MODEL (default grok-4.5).
