// GHOST CHAT BOX — frontend
// Supabase auth (Google / Apple / GitHub / email + password, verification, password reset,
// secure logout) plus private conversations and personal memory synced across devices.

const SUPABASE_URL = "https://yvxobnbctiurdlywqolr.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ojfH3yLoCmKEmzr5i5wKXw_uoxLIyVH";
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE = LOCAL ? "" : "https://ghostchatbox.onrender.com";
// Where Supabase sends people back after OAuth / email links. Must be in the
// Supabase "Redirect URLs" allow-list (see README).
const AUTH_REDIRECT = location.origin + location.pathname;

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

let messages = [];
let threads = [];
let busy = false;
let currentConversationId = null;

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 3200);
}

// ---------- UI helpers (layout only) ----------
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

// =====================================================================
// AUTH
// =====================================================================
const authGate = $("#authGate");
const authForm = $("#authForm");
const authNote = $("#authNote");
const authSubmit = $("#authSubmit");
const authEmail = $("#authEmail");
const authPassword = $("#authPassword");
const authConfirm = $("#authConfirm");

let sb = null;
let ghostSession = null;
let signedInUserId = null;
let authMode = "login";
let recoveryMode = false;
let authBusy = false;
let pendingEmail = "";

if (window.supabase) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

const AUTH_COPY = {
  login: {
    h: "WELCOME BACK",
    d: "Sign in to access your private conversations and personal GHOST memory.",
    submit: "LOG IN", toggle: "CREATE AN ACCOUNT"
  },
  signup: {
    h: "CREATE YOUR ACCOUNT",
    d: "Create an account to keep your conversations and memories across all your devices.",
    submit: "CREATE ACCOUNT", toggle: "ALREADY HAVE AN ACCOUNT? LOG IN"
  },
  forgot: {
    h: "RESET PASSWORD",
    d: "Enter your email and we'll send you a secure link to choose a new password.",
    submit: "SEND RESET LINK", toggle: "BACK TO LOGIN"
  },
  reset: {
    h: "NEW PASSWORD",
    d: "Choose a new password for your account. Use at least 8 characters.",
    submit: "UPDATE PASSWORD", toggle: ""
  },
  verify: {
    h: "VERIFY YOUR EMAIL",
    d: "One more step before you enter GHOST CHAT BOX.",
    submit: "", toggle: "BACK TO LOGIN"
  }
};

function setNote(text, ok = false) {
  authNote.textContent = text || "";
  authNote.style.color = ok ? "#7fd6a0" : "";
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  const msg = err?.message || "Something went wrong. Please try again.";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) return "Please verify your email first.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || err?.status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (code === "weak_password") return msg;
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "An account with this email already exists. Try logging in.";
  if (code === "same_password") return "Choose a password different from your current one.";
  if (code === "provider_disabled" || /provider is not enabled/i.test(msg)) return "That sign-in method isn't enabled yet.";
  if (/failed to fetch|network/i.test(msg)) return "Network problem. Check your connection and try again.";
  return msg;
}

function setAuthMode(next, note = "") {
  authMode = next;
  const c = AUTH_COPY[next];
  $("#authHeading").textContent = c.h;
  $("#authDescription").textContent = c.d;

  const isVerify = next === "verify";
  const showForm = !isVerify;
  authForm.hidden = !showForm;
  $("#authVerify").hidden = !isVerify;
  $("#oauthGroup").hidden = !(next === "login" || next === "signup");
  $("#authDivider").hidden = $("#oauthGroup").hidden;
  $("#emailField").hidden = next === "reset";
  $("#passwordField").hidden = next === "forgot";
  $("#confirmField").hidden = !(next === "signup" || next === "reset");
  $("#forgotLink").hidden = next !== "login";
  $("#authToggle").hidden = !c.toggle;
  $("#authToggle").textContent = c.toggle;
  authSubmit.textContent = c.submit;

  authEmail.required = next !== "reset";
  authPassword.required = next !== "forgot";
  authConfirm.required = next === "signup" || next === "reset";
  const newPw = next === "signup" || next === "reset";
  authPassword.autocomplete = newPw ? "new-password" : "current-password";
  authPassword.placeholder = newPw ? "At least 8 characters" : "Your password";
  $("#passwordLabel").textContent = next === "reset" ? "NEW PASSWORD" : "PASSWORD";
  authPassword.minLength = newPw ? 8 : 1;

  authPassword.value = ""; authConfirm.value = "";
  setPasswordVisible(false);
  setNote(note);
  $("#verifyNote").textContent = "";
}

function setPasswordVisible(show) {
  authPassword.type = show ? "text" : "password";
  authConfirm.type = show ? "text" : "password";
  const b = $("#pwToggle");
  b.textContent = show ? "HIDE" : "SHOW";
  b.setAttribute("aria-pressed", String(show));
  b.setAttribute("aria-label", show ? "Hide password" : "Show password");
}
$("#pwToggle").addEventListener("click", () => setPasswordVisible(authPassword.type === "password"));

function showAuth(next = "login", note = "") {
  authGate.classList.remove("hidden");
  if (next === "verify") showVerify(pendingEmail);
  else setAuthMode(next, note);
}

function setAuthBusy(on) {
  authBusy = on;
  authSubmit.disabled = on;
  document.querySelectorAll(".oauth-btn").forEach(b => (b.disabled = on));
}

// ----- verification view with resend cooldown -----
let resendTimer = null;
function showVerify(email, note = "") {
  pendingEmail = email || pendingEmail;
  setAuthMode("verify");
  $("#verifyText").textContent = pendingEmail
    ? `We sent a verification link to ${pendingEmail}. Open it to activate your account, then come back and log in. Check your spam folder if you don't see it.`
    : "We sent you a verification link. Open it to activate your account, then log in.";
  $("#verifyNote").textContent = note;
  startResendCooldown(60);
}
function startResendCooldown(seconds) {
  const btn = $("#resendButton");
  clearInterval(resendTimer);
  let left = seconds;
  const tick = () => {
    btn.disabled = left > 0;
    btn.textContent = left > 0 ? `RESEND IN ${left}s` : "RESEND VERIFICATION EMAIL";
    if (left-- <= 0) clearInterval(resendTimer);
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}
$("#resendButton").addEventListener("click", async () => {
  if (!sb || !pendingEmail) return;
  const note = $("#verifyNote");
  $("#resendButton").disabled = true;
  const { error } = await sb.auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: AUTH_REDIRECT } });
  if (error) { note.textContent = friendlyAuthError(error); startResendCooldown(30); return; }
  note.textContent = "Verification email sent. It may take a minute to arrive.";
  startResendCooldown(60);
});

// ----- toggles / links -----
$("#authToggle").addEventListener("click", () => {
  if (authMode === "login") setAuthMode("signup");
  else setAuthMode("login");
});
$("#forgotLink").addEventListener("click", () => setAuthMode("forgot"));

// ----- social login -----
document.querySelectorAll(".oauth-btn").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!sb || authBusy) return;
    setAuthBusy(true); setNote("Redirecting securely…");
    const { error } = await sb.auth.signInWithOAuth({ provider: btn.dataset.provider, options: { redirectTo: AUTH_REDIRECT } });
    if (error) { setNote(friendlyAuthError(error)); setAuthBusy(false); }
    // On success the browser leaves for the provider; reset if the user returns via Back.
    else setTimeout(() => { setAuthBusy(false); setNote(""); }, 4000);
  });
});

// ----- email + password / forgot / reset -----
authForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (authBusy) return;
  if (!sb) { setNote("Sign-in is unavailable right now. Please refresh the page."); return; }
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;
  const confirm = authConfirm.value;

  if (authMode !== "reset" && !/^\S+@\S+\.\S+$/.test(email)) { setNote("Enter a valid email address."); authEmail.focus(); return; }
  if ((authMode === "signup" || authMode === "reset")) {
    if (password.length < 8) { setNote("Use at least 8 characters for your password."); authPassword.focus(); return; }
    if (password !== confirm) { setNote("The two passwords don't match."); authConfirm.focus(); return; }
  }
  if (authMode === "login" && !password) { setNote("Enter your password."); authPassword.focus(); return; }

  setAuthBusy(true); setNote("Connecting securely…");
  try {
    if (authMode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.code === "email_not_confirmed" || /not confirmed/i.test(error.message)) {
          pendingEmail = email;
          showVerify(email, "Your email isn't verified yet. Open the link we sent, or resend it.");
        } else setNote(friendlyAuthError(error));
      }
      // Success is handled by onAuthStateChange.
    } else if (authMode === "signup") {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: AUTH_REDIRECT } });
      if (error) setNote(friendlyAuthError(error));
      else if (!data.session) { pendingEmail = email; showVerify(email); }
    } else if (authMode === "forgot") {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: AUTH_REDIRECT });
      if (error) setNote(friendlyAuthError(error));
      else setNote(`If an account exists for ${email}, a reset link is on its way. Check your inbox and spam folder.`, true);
    } else if (authMode === "reset") {
      const { error } = await sb.auth.updateUser({ password });
      if (error) setNote(friendlyAuthError(error));
      else {
        recoveryMode = false;
        toast("Password updated.");
        // Sign out every other device after a password change.
        sb.auth.signOut({ scope: "others" }).catch(() => {});
        const { data } = await sb.auth.getSession();
        handleSession(data.session);
      }
    }
  } catch (err) {
    setNote(friendlyAuthError(err));
  } finally {
    setAuthBusy(false);
  }
});

// ----- session lifecycle -----
const isVerified = user => !!(user && (user.email_confirmed_at || user.confirmed_at));

function displayName(user) {
  const m = user.user_metadata || {};
  return m.full_name || m.name || m.user_name || (user.email ? user.email.split("@")[0] : "GHOST CHAT BOX");
}

function handleSession(session) {
  if (!session) {
    const wasSignedIn = !!signedInUserId;
    if (wasSignedIn) resetClientState();
    ghostSession = null;
    // Only touch the gate if it was hidden; never reset a form the person is filling in.
    if (!recoveryMode && (wasSignedIn || authGate.classList.contains("hidden"))) showAuth("login");
    return;
  }
  const user = session.user;
  ghostSession = session;
  if (recoveryMode) {
    if (authMode !== "reset" || authGate.classList.contains("hidden")) showAuth("reset");
    return;
  }
  if (!isVerified(user)) {
    pendingEmail = user.email || pendingEmail;
    if (authMode !== "verify" || authGate.classList.contains("hidden")) showAuth("verify");
    return;
  }
  if (signedInUserId === user.id) { authGate.classList.add("hidden"); return; } // token refresh, end of recovery

  signedInUserId = user.id;
  authGate.classList.add("hidden");
  setAuthMode("login");
  const name = displayName(user);
  $("#accountEmail").textContent = user.email || "SIGNED IN";
  $("#accountName").textContent = name;
  $("#accountAvatar").textContent = (name[0] || "N").toUpperCase();
  loadCloudHistory();
}

function resetClientState() {
  signedInUserId = null; ghostSession = null;
  messages = []; threads = []; currentConversationId = null; busy = false;
  sendButton.disabled = false;
  messagesEl.innerHTML = ""; messagesEl.style.display = "none";
  welcome.style.display = "block"; chatArea.scrollTop = 0;
  input.value = ""; input.style.height = "auto";
  $("#accountEmail").textContent = "SIGNED OUT";
  $("#accountName").textContent = "GHOST CHAT BOX";
  $("#accountAvatar").textContent = "N";
  closeModals(); setSidebar(false); renderHistory();
  // Remove anything left on the device from this account.
  try { localStorage.removeItem("nocturne_threads"); } catch (_) {}
  try { sessionStorage.clear(); } catch (_) {}
}

if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    // Never await Supabase calls inside this callback; defer work instead.
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") { recoveryMode = true; ghostSession = session; showAuth("reset"); return; }
      if (event === "SIGNED_OUT") { recoveryMode = false; handleSession(null); return; }
      handleSession(session);
    }, 0);
  });
}

// Messages from email / OAuth links (expired link, denied access, etc.)
// The URL is only cleaned AFTER the Supabase client has finished reading it.
(async function handleAuthRedirect() {
  const params = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const errCode = params.get("error_code") || hash.get("error_code");
  const errDesc = params.get("error_description") || hash.get("error_description");
  const hadCode = params.has("code");
  if (!errCode && !errDesc && !hadCode) return;
  let session = null;
  if (sb) { try { session = (await sb.auth.getSession()).data.session; } catch (_) {} }
  history.replaceState(null, "", location.pathname);
  if (errCode || errDesc) {
    const text = errCode === "otp_expired"
      ? "That link has expired or was already used. Request a new one."
      : (errDesc || "Sign-in could not be completed.").replace(/\+/g, " ");
    showAuth("login", text);
    return;
  }
  if (!session) {
    showAuth("login", "If you just verified your email, you can log in now. If a link didn't work, open it in the same browser you requested it from, or request a new one.");
  }
})();

if (!sb) showAuth("login", "Sign-in is unavailable right now. Please refresh the page.");

// ----- authenticated API helper -----
async function apiFetch(path, options = {}) {
  if (!sb) throw new Error("Please sign in first.");
  const call = async token => fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  let { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Please sign in first.");
  let res = await call(session.access_token);
  if (res.status === 401) {
    const refreshed = await sb.auth.refreshSession();
    session = refreshed.data?.session;
    if (!session) {
      await sb.auth.signOut({ scope: "local" }).catch(() => {});
      handleSession(null);
      throw new Error("Your session expired. Please sign in again.");
    }
    res = await call(session.access_token);
  }
  return res;
}

async function readJson(r) { try { return await r.json(); } catch (_) { return {}; } }

// ----- logout -----
const logoutModal = $("#logoutModal");
$("#logoutButton").addEventListener("click", () => openModal(logoutModal));
async function logout(scope) {
  const b1 = $("#logoutHere"), b2 = $("#logoutEverywhere");
  b1.disabled = b2.disabled = true;
  try { if (sb) await sb.auth.signOut({ scope }); } catch (_) { /* local session is cleared regardless */ }
  recoveryMode = false;
  resetClientState();
  showAuth("login");
  b1.disabled = b2.disabled = false;
  toast(scope === "global" ? "Logged out of all devices." : "Logged out.");
}
$("#logoutHere").addEventListener("click", () => logout("local"));
$("#logoutEverywhere").addEventListener("click", () => logout("global"));

// ----- modal helpers -----
let lastFocus = null;
function openModal(el) {
  lastFocus = document.activeElement;
  el.hidden = false;
  const f = el.querySelector("input,button:not([data-close])");
  if (f && finePointer) f.focus();
}
function closeModals() {
  document.querySelectorAll(".modal").forEach(m => (m.hidden = true));
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (_) {} }
  lastFocus = null;
}
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) closeModals(); });
});

// =====================================================================
// CLOUD CONVERSATIONS + MEMORY
// =====================================================================
async function loadCloudHistory() {
  const uid = signedInUserId;
  try {
    const r = await apiFetch("/api/conversations");
    const d = await readJson(r);
    if (!r.ok) throw new Error(d.error || "Could not load history");
    if (uid !== signedInUserId) return; // user changed while loading
    threads = d.conversations || [];
    renderHistory();
  } catch (e) { toast(e.message); }
}

async function ensureCloudConversation(firstText) {
  if (currentConversationId) return currentConversationId;
  const r = await apiFetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: firstText.slice(0, 100) || "New conversation" }) });
  const d = await readJson(r); if (!r.ok) throw new Error(d.error || "Could not create conversation");
  currentConversationId = d.conversation.id;
  return currentConversationId;
}

async function saveCloudMessage(role, content) {
  const id = await ensureCloudConversation(messages.find(m => m.role === "user")?.content || "New conversation");
  const r = await apiFetch(`/api/conversations/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, content }) });
  const d = await readJson(r); if (!r.ok) throw new Error(d.error || "Could not save message");
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
    b.className = "history-item" + (t.id === currentConversationId ? " active" : "");
    b.textContent = "◦  " + (t.title || "Conversation");
    b.onclick = () => loadThread(t.id);
    el.appendChild(b);
  });
}

let loadToken = 0;
async function loadThread(id) {
  if (busy) { toast("Wait for the current reply to finish."); return; }
  const token = ++loadToken;
  setSidebar(false);
  try {
    const r = await apiFetch(`/api/conversations/${id}/messages`);
    const d = await readJson(r);
    if (!r.ok) throw new Error(d.error || "Could not open conversation");
    if (token !== loadToken) return;
    currentConversationId = id;
    messages = (d.messages || []).map(m => ({ role: m.role, content: m.content }));
    showChat();
    renderMessages();
    renderHistory();
  } catch (e) { toast(e.message); }
}

// Pick up conversations and memories created on another device when this tab regains focus.
let lastSync = 0;
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !signedInUserId || busy) return;
  if (Date.now() - lastSync < 15000) return;
  lastSync = Date.now();
  await loadCloudHistory();
  if (currentConversationId && !busy) {
    try {
      const r = await apiFetch(`/api/conversations/${currentConversationId}/messages`);
      const d = await readJson(r);
      if (r.ok && !busy && (d.messages || []).length > messages.length) {
        messages = d.messages.map(m => ({ role: m.role, content: m.content }));
        renderMessages();
      }
    } catch (_) {}
  }
});

// ----- personal memory panel -----
const memoryModal = $("#memoryModal");
async function loadMemories() {
  const list = $("#memoryList");
  list.innerHTML = '<div class="memory-empty">LOADING…</div>';
  try {
    const r = await apiFetch("/api/memories");
    const d = await readJson(r);
    if (!r.ok) throw new Error(d.error || "Could not load memories");
    renderMemories(d.memories || []);
  } catch (e) { list.innerHTML = ""; toast(e.message); }
}
function renderMemories(items) {
  const list = $("#memoryList");
  list.innerHTML = "";
  if (!items.length) { list.innerHTML = '<div class="memory-empty">NOTHING REMEMBERED YET</div>'; return; }
  items.forEach(m => {
    const row = document.createElement("div"); row.className = "memory-item";
    const text = document.createElement("span"); text.textContent = m.content;
    const del = document.createElement("button"); del.type = "button"; del.textContent = "✕"; del.setAttribute("aria-label", "Delete memory");
    del.onclick = async () => {
      del.disabled = true;
      try {
        const r = await apiFetch(`/api/memories/${m.id}`, { method: "DELETE" });
        if (!r.ok) throw new Error((await readJson(r)).error || "Could not delete memory");
        row.remove();
        if (!list.children.length) renderMemories([]);
      } catch (e) { del.disabled = false; toast(e.message); }
    };
    row.append(text, del); list.appendChild(row);
  });
}
$("#memoryNav").addEventListener("click", () => { setSidebar(false); openModal(memoryModal); loadMemories(); });
$("#memoryForm").addEventListener("submit", async e => {
  e.preventDefault();
  const field = $("#memoryInput"); const content = field.value.trim();
  if (!content) return;
  try {
    const r = await apiFetch("/api/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    const d = await readJson(r); if (!r.ok) throw new Error(d.error || "Could not save memory");
    field.value = ""; loadMemories();
  } catch (err) { toast(err.message); }
});

// =====================================================================
// CHAT
// =====================================================================
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

  if (!text || busy || !signedInUserId) return;

  showChat();

  const rememberMatch = text.match(/^(?:remember(?: that)?|save this(?: memory)?):?\s*(.+)$/i);
  if (rememberMatch) {
    try {
      const mr = await apiFetch("/api/memories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: rememberMatch[1] }) });
      const md = await readJson(mr); if (!mr.ok) throw new Error(md.error || "Could not save memory");
      messages.push({ role: "user", content: text }, { role: "assistant", content: "I'll keep that in your personal memory. It will follow you across your devices." });
      renderMessages(); input.value = ""; input.style.height = "auto"; return;
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

  const startedNew = !currentConversationId;
  try {
    // Saving must never block the answer; warn if sync fails.
    try { await saveCloudMessage("user", text); }
    catch (e) { toast("Couldn't sync this message: " + e.message); }

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

    const data = await readJson(r);

    if (!r.ok) {
      throw new Error(data.error || "Request failed");
    }

    messages.push({
      role: "assistant",
      content: data.reply
    });
    try { await saveCloudMessage("assistant", data.reply); }
    catch (e) { toast("Couldn't sync the reply: " + e.message); }

    typing.remove();
    renderMessages();

    if (startedNew) await loadCloudHistory();

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
  loadToken++;
  messagesEl.innerHTML = "";
  messagesEl.style.display = "none";
  welcome.style.display = "block";
  chatArea.scrollTop = 0;
  setSidebar(false);
  renderHistory();
  if (finePointer) input.focus();
};

menuBtn.onclick = () => {
  setSidebar(!sidebar.classList.contains("open"));
};

$("#sidebarClose").onclick = () => setSidebar(false);
$("#scrim").onclick = () => setSidebar(false);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { setSidebar(false); closeModals(); }
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
