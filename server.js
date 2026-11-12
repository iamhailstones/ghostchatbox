
require("dotenv").config();

const express = require("express");
const Groq = require("groq-sdk");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Allow requests from your Vercel frontend.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json({ limit: "2mb" }));

// Serve the frontend if needed.
app.use(express.static(path.join(__dirname, "public")));

// Health check.
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "GHOST CHAT BOX is running."
  });
});

// AI chat endpoint.
app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "The AI service is not configured."
      });
    }

    const { messages, mode } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "Please provide a conversation."
      });
    }

    const modeInstructions = {
      "Deep Chat": "Think carefully and deeply. Give clear, intelligent and well-reasoned answers.",
      "Shadow Mode": "Explore difficult or uncomfortable subjects analytically and thoughtfully.",
      "Investigation": "Separate verified facts from assumptions. Examine evidence and uncertainty carefully.",
      "Debate": "Challenge ideas constructively. Examine arguments, counterarguments and assumptions."
    };

    const systemPrompt = `
You are GHOST CHAT BOX, an intelligent AI assistant developed by Hailstones.

Speak naturally, clearly and intelligently.
Be helpful, honest and conversational.
Avoid unnecessary headings, tables and excessively long answers.
Never invent personal facts or pretend to know things you do not know.
If you are unsure, say so naturally.
Mention Hailstones only when relevant.
Never reveal internal API keys or private configuration details.
Never mention the AI service provider or model name.

Conversation mode: ${mode || "Deep Chat"}

Mode instructions:
${modeInstructions[mode] || modeInstructions["Deep Chat"]}
`;

    const conversation = messages
      .filter(m =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      )
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    if (!conversation.length) {
      return res.status(400).json({
        error: "No valid messages were provided."
      });
    }

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...conversation
      ],
      temperature: 0.7,
      max_completion_tokens: 2048
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "I couldn't generate a response. Please try again.";

    res.json({ reply });

  } catch (error) {
    console.error("Chat error:", error.message);

    res.status(500).json({
      error: "Something went wrong while processing your message. Please try again."
    });
  }
});

// Start server.
app.listen(PORT, () => {
  console.log(`GHOST CHAT BOX running on port ${PORT}`);
});
