// Vercel serverless function: POST /api/chat  { messages: [{role, content}] }  ->  { reply }
// Powered by xAI Grok. Set XAI_API_KEY in Vercel > Project > Settings > Environment Variables.
// Optional: GROK_MODEL (default grok-4.5).
const fs = require("fs");
const path = require("path");

let SYSTEM = "";
try { SYSTEM = fs.readFileSync(path.join(process.cwd(), "system-prompt.md"), "utf8"); } catch (e) {}

const hits = new Map(); // best-effort per-IP rate limit (resets when the function cold-starts)
const limited = (ip) => {
  const now = Date.now(), win = 60000, max = 20;
  const a = (hits.get(ip) || []).filter((t) => now - t < win);
  a.push(now); hits.set(ip, a);
  return a.length > max;
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.XAI_API_KEY || !SYSTEM) return res.status(500).json({ error: "Server isn’t configured yet." });

  const ip = String(req.headers["x-forwarded-for"] || "anon").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ error: "Slow down a bit." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  let msgs = Array.isArray(body && body.messages) ? body.messages : [];
  msgs = msgs
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-20);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "Send a message." });

  const system = SYSTEM + "\n\nToday’s date: " + new Date().toISOString().slice(0, 10) + ".";
  try {
    const r = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + process.env.XAI_API_KEY,
      },
      body: JSON.stringify({
        model: process.env.GROK_MODEL || "grok-4.5",
        max_completion_tokens: 1500,
        messages: [{ role: "system", content: system }, ...msgs],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "The AI is unavailable right now." });
    const m = d.choices && d.choices[0] && d.choices[0].message;
    const reply = ((m && m.content) || "").trim();
    return res.status(200).json({ reply: reply || "…" });
  } catch (e) {
    return res.status(502).json({ error: "The AI is unavailable right now." });
  }
};
