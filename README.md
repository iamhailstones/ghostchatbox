# GHOST CHAT BOX

A dark-mode AI chat app with four conversation modes, local conversation history, responsive layout, and a server-side Groq API connection.

## Requirements
- Node.js 18+
- A Groq API key from https://console.groq.com/keys

## Run locally
1. Extract the ZIP and open a terminal in the project folder.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env`.
4. Put your Groq key in the server-side `.env` file:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   GROQ_MODEL=openai/gpt-oss-120b
   PORT=3000
   ```
5. Start with `npm start`.
6. Open http://localhost:3000

## Security
Never put the API key in browser JavaScript or HTML. Do not commit `.env`. The health endpoint reports only whether a key is configured, never the key.

## Notes
- Backend uses the official `groq-sdk` JavaScript SDK.
- The default model is `openai/gpt-oss-120b`; change `GROQ_MODEL` to another model available to your Groq account if needed.
- Conversation history remains in browser localStorage on that device.
- API authentication, rate-limit, provider availability, and request errors return client-safe messages.
