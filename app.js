
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
let threads = JSON.parse(localStorage.getItem("nocturne_threads") || "[]");
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

  messages = JSON.parse(JSON.stringify(t.messages));
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
    const r = await fetch(`${API_BASE}/api/chat`, {
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

    typing.remove();
    renderMessages();

    threads.unshift({
      id: Date.now(),
      title: text.slice(0, 48),
      messages: JSON.parse(JSON.stringify(messages))
    });

    threads = threads.slice(0, 25);

    localStorage.setItem(
      "nocturne_threads",
      JSON.stringify(threads)
    );

    renderHistory();

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
  if (messages.length) saveThread();

  messages = [];
  messagesEl.innerHTML = "";
  messagesEl.style.display = "none";
  welcome.style.display = "block";
  chatArea.scrollTop = 0;
  setSidebar(false);
  if (finePointer) input.focus();
};

$("#clearAll").onclick = () => {
  if (confirm("Clear all saved conversations from this browser?")) {
    threads = [];
    localStorage.removeItem("nocturne_threads");
    renderHistory();
    toast("Local conversation history cleared.");
  }
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
  toast("Chats are stored in this browser. Messages are sent to your configured AI service when you chat.");
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
