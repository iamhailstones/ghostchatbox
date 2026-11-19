// Supabase authentication and private account storage.
const SUPABASE_URL = "https://yvxobnbctiurdlywqolr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ojfH3yLoCmKEmzr5i5wKXw_uoxLIyVH";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let ghostSession = null;
let authMode = "login";
let currentConversationId = null;
const authGate = document.getElementById("authGate");
const authForm = document.getElementById("authForm");
const authNote = document.getElementById("authNote");
function setAuthMode(next) {
  authMode = next;
  document.getElementById("authHeading").textContent = next === "login" ? "WELCOME BACK" : "CREATE YOUR ACCOUNT";
  document.getElementById("authDescription").textContent = next === "login" ? "Sign in to access your private conversations and personal GHOST memory." : "Create an account to keep your conversations and memories across devices.";
  document.getElementById("authSubmit").textContent = next === "login" ? "LOG IN" : "CREATE ACCOUNT";
  document.getElementById("authToggle").textContent = next === "login" ? "CREATE AN ACCOUNT" : "BACK TO LOGIN";
  document.getElementById("authPassword").autocomplete = next === "login" ? "current-password" : "new-password";
  authNote.textContent = "";
}
document.getElementById("authToggle").addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
async function apiFetch(path, options = {}) {
  const session = ghostSession || (await sb.auth.getSession()).data.session;
  if (!session) throw new Error("Please sign in first.");
  ghostSession = session;
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${session.access_token}` };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
async function loadCloudHistory() {
  try {
    const r = await apiFetch("/api/conversations"); const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Could not load history");
    threads = d.conversations || []; renderHistory();
  } catch (e) { toast(e.message); }
}
authForm.addEventListener("submit", async e => {
  e.preventDefault(); authNote.textContent = "Connecting securely…";
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  const result = authMode === "login"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  if (result.error) { authNote.textContent = result.error.message; return; }
  if (authMode === "signup" && !result.data.session) {
    authNote.textContent = "Account created. Check your email to confirm, then log in.";
    setAuthMode("login"); return;
  }
  ghostSession = result.data.session;
  authGate.classList.add("hidden");
  document.getElementById("accountEmail").textContent = email;
  await loadCloudHistory();
});
document.getElementById("logoutButton").addEventListener("click", async () => {
  await sb.auth.signOut(); ghostSession = null; currentConversationId = null; messages = []; threads = []; renderMessages(); renderHistory();
});
sb.auth.onAuthStateChange((_event, session) => {
  ghostSession = session;
  if (session) {
    authGate.classList.add("hidden");
    const el = document.getElementById("accountEmail"); if (el) el.textContent = session.user.email || "SIGNED IN";
    setTimeout(loadCloudHistory, 0);
  } else {
    authGate.classList.remove("hidden");
    const el = document.getElementById("accountEmail"); if (el) el.textContent = "SIGNED OUT";
  }
});
async function ensureCloudConversation(firstText) {
  if (currentConversationId) return currentConversationId;
  const r = await apiFetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: firstText.slice(0, 100) || "New conversation" }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not create conversation");
  currentConversationId = d.conversation.id; return currentConversationId;
}
async function saveCloudMessage(role, content) {
  const id = await ensureCloudConversation(messages.find(m => m.role === "user")?.content || "New conversation");
  const r = await apiFetch(`/api/conversations/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, content }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not save message");
}
const API_BASE = "https://ghostchatbox.onrender.com";

const $ = s => document.querySelector(s);

const welcome = $("#welcome");
const messagesEl = $("#messages");
const form = $("#chatForm");
const input = $("#messageInput");
const sendButton = $("#sendButton");
const mode = $("#mode");
const chatArea = $("#chatArea");
const sidebar = $("#sidebar");
const menuBtn = $("#mobileMenu");
const finePointer = window.matchMedia("(pointer: fine)").matches;

// ---------- UI helpers (layout only, no change to chat logic) ----------
function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function setSidebar(open) {
  sidebar.classList.toggle("open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
}

// Keep the layout the exact size of the visible area, so the composer
// stays above the on-screen keyboard on phones.
(function syncViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const sync = () => {
    root.style.setProperty("--app-h", vv.height + "px");
    if (window.scrollY || vv.offsetTop) window.scrollTo(0, 0);
    if (document.activeElement === input) scrollToBottom();
  };
  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  sync();
})();

let messages = [];
let threads = [];
let busy = false;

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 3200);
}

function saveThread() {
  if (!messages.length) return;

  const thread = {
    id: Date.now(),
    title: (messages.find(m => m.role === "user")?.content || "Conversation").slice(0, 48),
    messages
  };

  threads.unshift(thread);
  threads = threads.slice(0, 25);
  localStorage.setItem("nocturne_threads", JSON.stringify(threads));
  renderHistory();
}

function renderHistory() {
  const el = $("#history");
  el.innerHTML = "";

  if (!threads.length) {
    el.innerHTML = '<div class="empty-history">Your conversations will appear here.</div>';
    return;
  }

  threads.forEach(t => {
    const b = document.createElement("button");
    b.className = "history-item";
    b.textContent = "◦  " + t.title;
    b.onclick = () => loadThread(t.id);
    el.appendChild(b);
  });
}

function loadThread(id) {
  const t = threads.find(x => x.id === id);
  if (!t) return;

  currentConversationId = t.id;
  messages = JSON.parse(JSON.stringify(t.messages || []));
  renderMessages();
  welcome.style.display = "none";
  messagesEl.style.display = "block";
  setSidebar(false);
}

function renderMessages() {
  messagesEl.innerHTML = "";

  messages.forEach(m => {
    const row = document.createElement("article");
    row.className = "message " + m.role;

    const av = document.createElement("div");
    av.className = "message-avatar";
    av.textContent = m.role === "assistant" ? "N" : "Y";

    const body = document.createElement("div");
    body.className = "message-body";

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = m.role === "assistant" ? "GHOST CHAT BOX" : "YOU";

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = m.content;

    body.append(meta, content);
    row.append(av, body);
    messagesEl.appendChild(row);
  });

  scrollToBottom();
}

function showChat() {
  welcome.style.display = "none";
  messagesEl.style.display = "block";
}

async function send(text) {
  text = text.trim();

  if (!text || busy) return;

  showChat();

  const rememberMatch = text.match(/^(?:remember(?: that)?|save this(?: memory)?):?\s*(.+)$/i);
  if (rememberMatch) {
    try {
      const mr = await apiFetch("/api/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: rememberMatch[1] }) });
      const md = await mr.json(); if (!mr.ok) throw new Error(md.error || "Could not save memory");
      messages.push({ role: "user", content: text }, { role: "assistant", content: "I'll keep that in your personal memory." });
      renderMessages(); input.value = ""; return;
    } catch (err) { toast(err.message); return; }
  }

  messages.push({
    role: "user",
    content: text
  });

  renderMessages();

  input.value = "";
  input.style.height = "auto";

  busy = true;
  sendButton.disabled = true;

  const typing = document.createElement("div");
  typing.className = "typing";
  typing.textContent = "GHOST CHAT BOX IS THINKING…";

  messagesEl.appendChild(typing);
  scrollToBottom();

  try {
    await saveCloudMessage("user", text);
    const r = await apiFetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages,
        mode: mode.value
      })
    });

    const data = await r.json();

    if (!r.ok) {
      throw new Error(data.error || "Request failed");
    }

    messages.push({
      role: "assistant",
      content: data.reply
    });
    await saveCloudMessage("assistant", data.reply);

    typing.remove();
    renderMessages();

    await loadCloudHistory();

  } catch (e) {
    typing.remove();

    messages.push({
      role: "assistant",
      content: "Connection notice: " + e.message
    });

    renderMessages();

  } finally {
    busy = false;
    sendButton.disabled = false;
    if (finePointer) input.focus();
    scrollToBottom();
  }
}

form.addEventListener("submit", e => {
  e.preventDefault();
  send(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
});

input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach(b => {
  b.addEventListener("click", () => send(b.dataset.prompt));
});

$("#newChat").onclick = () => {
  messages = [];
  currentConversationId = null;
  messagesEl.innerHTML = "";
  messagesEl.style.display = "none";
  welcome.style.display = "block";
  chatArea.scrollTop = 0;
  setSidebar(false);
  if (finePointer) input.focus();
};

menuBtn.onclick = () => {
  setSidebar(!sidebar.classList.contains("open"));
};

$("#sidebarClose").onclick = () => setSidebar(false);
$("#scrim").onclick = () => setSidebar(false);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") setSidebar(false);
});

$("#focusMode").onclick = () => {
  const on = document.body.classList.toggle("focus");
  setSidebar(false);
  toast(on ? "Focus mode on. Use the menu button for navigation." : "Focus mode off.");
};

$("#themeInfo").onclick = () => {
  toast("Your account conversations and saved memories are stored privately with your account.");
};

mode.onchange = () => {
  $("#modeHint").textContent = {
    "Deep Chat": "Reason deeply. Speak clearly.",
    "Shadow Mode": "Explore difficult subjects analytically.",
    "Investigation": "Separate evidence from speculation.",
    "Debate": "Stress-test ideas and assumptions."
  }[mode.value];
};

renderHistory();

// Check the Render backend connection.
fetch(`${API_BASE}/api/health`)
  .then(r => {
    if (!r.ok) throw new Error("Server unavailable");
    return r.json();
  })
  .then(d => {
    $("#connectionText").textContent = d.ok
      ? "MODEL CONNECTION READY"
      : "SERVER OFFLINE";
  })
  .catch(() => {
    $("#connectionText").textContent = "SERVER OFFLINE";
  });
