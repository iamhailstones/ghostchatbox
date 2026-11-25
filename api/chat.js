
const fs = require("fs");
const path = require("path");

let SYSTEM = "";

try {
  SYSTEM = fs.readFileSync(
    path.join(process.cwd(), "system-prompt.md"),
    "utf8"
  );
} catch (error) {
  console.error("Could not load system prompt:", error.message);
}

const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const windowMs = 60000;
  const max = 20;

  const requests = (hits.get(ip) || []).filter(
    (time) => now - time < windowMs
  );

  requests.push(now);
  hits.set(ip, requests);

  return requests.length > max;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  if (!process.env.GROQ_API_KEY || !SYSTEM) {
    return res.status(500).json({
      error: "Server isn't configured yet."
    });
  }

  const ip = String(
    req.headers["x-forwarded-for"] || "anon"
  ).split(",")[0].trim();

  if (limited(ip)) {
    return res.status(429).json({
      error: "Slow down a bit."
    });
  }

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  let messages = Array.isArray(body && body.messages)
    ? body.messages
    : [];

  messages = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4000)
    }))
    .slice(-20);

  while (messages.length && messages[0].role !== "user") {
    messages.shift();
  }

  if (
    !messages.length ||
    messages[messages.length - 1].role !== "user"
  ) {
    return res.status(400).json({
      error: "Send a message."
    });
  }

  const system =
    SYSTEM +
    "\n\nToday's date: " +
    new Date().toISOString().slice(0, 10) +
    ".";

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + process.env.GROQ_API_KEY
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          max_completion_tokens: 1500,
          messages: [
            { role: "system", content: system },
            ...messages
          ]
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Groq API error:", data);
      return res.status(502).json({
        error: "The AI is unavailable right now."
      });
    }

    const reply = (
      data.choices?.[0]?.message?.content || ""
    ).trim();

    return res.status(200).json({
      reply: reply || "..."
    });

  } catch (error) {
    console.error("Chat error:", error);
    return res.status(502).json({
      error: "The AI is unavailable right now."
    });
  }
};
