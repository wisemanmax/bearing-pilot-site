import { supabaseKey, supabaseUrl } from "./site-config.mjs";

// Bearing client portal. Email-OTP login against Supabase Auth (no SDK, plain
// fetch), then a read-only view of pilot progress and documents. Every network
// call fails to calm human copy and never loses the client's input; blank
// config renders an honest closed state.

const SESSION_KEY = "bearing-portal-session";
const BUCKET = "bearing-portal";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB client-side cap
const REFRESH_MARGIN_MS = 60_000; // refresh when within 60s of expiry
const UPLOAD_ACCEPT = ".pdf,.csv,.xlsx,.docx,.png,.jpg";

// Session epoch. Every async flow captures the epoch before its first await and
// bails after each await if it changed. signOut() increments it, so any request
// already in flight when a client signs out can never write session, pilot id,
// or DOM — a stale continuation cannot resurrect a signed-out session or leak
// its data to the next signer-in.
let sessionEpoch = 0;

// The eight-stage course plot, in order, with the labels shown on the timeline.
const STAGES = [
  { key: "booked", label: "Booked" },
  { key: "paid", label: "Paid" },
  { key: "assessment_received", label: "Assessment received" },
  { key: "analysis", label: "Advisor analysis" },
  { key: "delivered", label: "One-Page Truth delivered" },
  { key: "debrief_scheduled", label: "Debrief scheduled" },
  { key: "debriefed", label: "Debriefed" },
  { key: "followup", label: "Follow-up" },
];

// --- Pure helpers (unit-tested) --------------------------------------------

// Turn a user-supplied filename into a safe single path segment: no directory
// separators, no control characters, collapsed whitespace, bounded length. The
// negated class drops control chars and any character that isn't a word char,
// dot, dash, or space, so only clearly-safe key characters survive.
export function sanitizeFilename(name, maxLength = 120) {
  if (typeof name !== "string") return "file";
  let out = name
    .replace(/[\\/]+/g, " ") // path separators become a break, never survive
    .replace(/[^\w.\- ]+/g, "") // drop control chars and anything unsafe
    .replace(/\s+/g, " ") // collapse whitespace runs
    .replace(/^[.\s]+/, "") // no leading dots/space (no hidden or .. names)
    .trim();
  if (out.length > maxLength) out = out.slice(0, maxLength).trim();
  if (out === "") out = "file";
  return out;
}

// True when there is no usable session, or the access token is expired or
// within REFRESH_MARGIN_MS of expiring. Sessions store expires_at as epoch ms.
export function sessionIsExpiring(session, nowMs) {
  if (!session || typeof session.expires_at !== "number") return true;
  return nowMs >= session.expires_at - REFRESH_MARGIN_MS;
}

// --- Config + session plumbing ---------------------------------------------

function configReady(url = supabaseUrl, key = supabaseKey) {
  return (
    typeof url === "string" && url.trim() !== "" &&
    typeof key === "string" && key.trim() !== ""
  );
}

const apiBase = () => supabaseUrl.replace(/\/+$/, "");

function loadSession() {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable — session simply won't persist */
  }
}

function clearSession() {
  try {
    globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// Shape a Supabase Auth token response into our stored session. expires_in is
// seconds from now; we stamp an absolute epoch-ms expiry so refresh timing does
// not depend on when the value is later read.
function toSession(token, nowMs) {
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: nowMs + (Number(token.expires_in) || 0) * 1000,
    email: token.user?.email || "",
  };
}

// --- Auth REST --------------------------------------------------------------

// Ask Supabase to email a 6-digit code. create_user:false means only emails the
// founder pre-registered can receive one — an unknown email returns an error we
// surface as a calm "not registered yet" state.
async function requestOtp(email, request = globalThis.fetch) {
  const response = await request(`${apiBase()}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: false }),
  });
  return response.ok;
}

async function verifyOtp(email, token, request = globalThis.fetch) {
  const response = await request(`${apiBase()}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", email, token }),
  });
  if (!response.ok) return null;
  return response.json();
}

async function refreshSession(refreshToken, request = globalThis.fetch) {
  const response = await request(
    `${apiBase()}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: { apikey: supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  if (!response.ok) return null;
  return response.json();
}

function authHeaders(session) {
  return { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}` };
}

// --- Data + storage REST ----------------------------------------------------

async function fetchProgress(session, request = globalThis.fetch) {
  const response = await request(
    `${apiBase()}/rest/v1/bearing_portal_progress?select=stage,status,note&order=updated_at.asc`,
    { headers: authHeaders(session) },
  );
  if (!response.ok) throw new Error("progress");
  return response.json();
}

// List the immediate children of a storage folder. The list endpoint is NOT
// recursive, so callers pass the exact folder prefix they want (the pilot root
// vs its uploads/ subfolder). Each returned object's name is relative to that
// prefix; folders come back as placeholder entries with a null id.
async function listFolder(session, prefix, request = globalThis.fetch) {
  const response = await request(`${apiBase()}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...authHeaders(session), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100, sortBy: { column: "name", order: "asc" } }),
  });
  if (!response.ok) throw new Error("list");
  return response.json();
}

async function downloadDocument(session, path, request = globalThis.fetch) {
  const response = await request(
    `${apiBase()}/storage/v1/object/authenticated/${BUCKET}/${path}`,
    { headers: authHeaders(session) },
  );
  if (!response.ok) throw new Error("download");
  return response.blob();
}

// Uploads always land under <pilot_id>/uploads/ with a timestamped, sanitized
// name so a client can never overwrite a founder deliverable at the root.
async function uploadDocument(session, pilotId, file, nowMs, request = globalThis.fetch) {
  const path = `${pilotId}/uploads/${nowMs}-${sanitizeFilename(file.name)}`;
  const response = await request(`${apiBase()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...authHeaders(session), "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!response.ok) throw new Error("upload");
  return path;
}

// --- DOM wiring -------------------------------------------------------------

if (typeof document !== "undefined") {
  initPortal();
}

function initPortal() {
  const views = {
    closed: document.querySelector("#portal-closed"),
    login: document.querySelector("#portal-login"),
    dashboard: document.querySelector("#portal-dashboard"),
  };

  const show = (name) => {
    for (const [key, el] of Object.entries(views)) {
      if (el) el.hidden = key !== name;
    }
  };

  if (!configReady()) {
    show("closed");
    return;
  }

  // Login step elements.
  const emailForm = document.querySelector("#login-email-form");
  const emailInput = document.querySelector("#login-email");
  const emailSubmit = document.querySelector("#login-email-submit");
  const emailStatus = document.querySelector("#login-email-status");
  const codeForm = document.querySelector("#login-code-form");
  const codeInput = document.querySelector("#login-code");
  const codeSubmit = document.querySelector("#login-code-submit");
  const codeStatus = document.querySelector("#login-code-status");
  const codeBack = document.querySelector("#login-back");
  const codeEmailEcho = document.querySelector("#login-code-email");

  let pendingEmail = "";
  // The signed-in client's session and pilot. The upload handler is bound once
  // but reads these live, so a sign-out and a fresh sign-in can never upload (or
  // download) against the previous client's session.
  let activeSession = null;
  let activePilotId = "";

  const setStatus = (el, message, tone = "info") => {
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
    el.hidden = message === "";
  };

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = (emailInput?.value || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setStatus(emailStatus, "Enter the email address Bearing registered for your pilot.", "error");
      return;
    }
    emailSubmit.disabled = true;
    emailSubmit.textContent = "Sending code…";
    setStatus(emailStatus, "");
    // Whether the email is registered or not, advance to the code step with the
    // same neutral message — never reveal which addresses are pilot clients
    // (avoids an email-enumeration oracle). Only a genuine network failure
    // (a thrown fetch) surfaces a retry.
    let networkError = false;
    try {
      await requestOtp(email);
    } catch {
      networkError = true;
    }
    emailSubmit.disabled = false;
    emailSubmit.textContent = "Email me a code";
    if (networkError) {
      setStatus(
        emailStatus,
        "Couldn't reach the server just now. Check your connection and try again.",
        "error",
      );
      return;
    }
    pendingEmail = email;
    if (codeEmailEcho) codeEmailEcho.textContent = email;
    emailForm.hidden = true;
    if (codeForm) codeForm.hidden = false;
    setStatus(
      codeStatus,
      "If that email is registered for the portal, we've sent it a 6-digit code.",
      "info",
    );
    codeInput?.focus();
  });

  codeBack?.addEventListener("click", () => {
    if (codeForm) codeForm.hidden = true;
    if (emailForm) emailForm.hidden = false;
    setStatus(codeStatus, "");
    emailInput?.focus();
  });

  codeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const epoch = sessionEpoch;
    const code = (codeInput?.value || "").trim();
    if (code === "") {
      setStatus(codeStatus, "Enter the 6-digit code from your email.", "error");
      return;
    }
    codeSubmit.disabled = true;
    codeSubmit.textContent = "Signing in…";
    setStatus(codeStatus, "");
    let token = null;
    try {
      token = await verifyOtp(pendingEmail, code);
    } catch {
      token = null;
    }
    // A sign-out during code entry must not be resurrected by a late verify.
    if (epoch !== sessionEpoch) return;
    codeSubmit.disabled = false;
    codeSubmit.textContent = "Sign in";
    if (token?.access_token) {
      const session = toSession(token, Date.now());
      saveSession(session);
      enterDashboard(session);
    } else {
      setStatus(codeStatus, "That code didn't match. Check it and try again, or request a new one.", "error");
    }
  });

  // Sign out cleanly. Bumping the epoch invalidates every request already in
  // flight; clearing storage and in-memory state and showing the login view
  // leaves nothing a stale continuation could write back into.
  function signOut() {
    sessionEpoch += 1;
    // Revoke the session server-side too, so the refresh token dies with the
    // local copy. Fire-and-forget: local sign-out must never wait on the network.
    const token = activeSession?.access_token;
    if (token) {
      fetch(`${apiBase()}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearSession();
    activeSession = null;
    activePilotId = "";
    resetLogin();
    show("login");
  }

  const signout = document.querySelector("#signout");
  signout?.addEventListener("click", signOut);

  function resetLogin() {
    pendingEmail = "";
    if (emailForm) emailForm.hidden = false;
    if (codeForm) codeForm.hidden = true;
    if (emailInput) emailInput.value = "";
    if (codeInput) codeInput.value = "";
    setStatus(emailStatus, "");
    setStatus(codeStatus, "");
  }

  // Resume an existing session on load, refreshing if it is near expiry. A
  // failed refresh signs out cleanly to the login view.
  (async () => {
    const epoch = sessionEpoch;
    let session = loadSession();
    if (!session) {
      show("login");
      return;
    }
    if (sessionIsExpiring(session, Date.now())) {
      let refreshed = null;
      try {
        refreshed = session.refresh_token ? await refreshSession(session.refresh_token) : null;
      } catch {
        refreshed = null;
      }
      if (epoch !== sessionEpoch) return;
      if (refreshed?.access_token) {
        session = toSession(refreshed, Date.now());
        saveSession(session);
      } else {
        signOut();
        return;
      }
    }
    enterDashboard(session);
  })();

  function enterDashboard(session) {
    show("dashboard");
    loadMembershipThenRender(session);
  }

  // The membership row carries the pilot_id; everything else keys off it.
  async function loadMembershipThenRender(session) {
    const epoch = sessionEpoch;
    const titleEl = document.querySelector("#dashboard-title");
    let pilotId = "";
    try {
      const response = await globalThis.fetch(
        `${apiBase()}/rest/v1/bearing_portal_members?select=pilot_id`,
        { headers: authHeaders(session) },
      );
      if (epoch !== sessionEpoch) return;
      if (response.ok) {
        const rows = await response.json();
        if (epoch !== sessionEpoch) return;
        pilotId = rows[0]?.pilot_id || "";
      }
    } catch {
      pilotId = "";
    }
    if (epoch !== sessionEpoch) return;

    activeSession = session;
    activePilotId = pilotId;

    if (!pilotId) {
      if (titleEl) titleEl.textContent = "Your First Bearing";
      wireUpload();
      renderProgressError();
      renderDocsError();
      return;
    }

    if (titleEl) titleEl.textContent = `${pilotId} — your First Bearing`;
    renderProgress(session);
    renderDocuments(session, pilotId);
  }

  function renderProgressError() {
    const status = document.querySelector("#progress-status");
    setStatus(status, "We couldn't load your progress just now. Refresh in a moment.", "error");
  }

  async function renderProgress(session) {
    const epoch = sessionEpoch;
    const list = document.querySelector("#progress-list");
    const status = document.querySelector("#progress-status");
    setStatus(status, "Loading your progress…", "info");
    let rows = [];
    try {
      rows = await fetchProgress(session);
    } catch {
      if (epoch !== sessionEpoch) return;
      renderProgressError();
      return;
    }
    if (epoch !== sessionEpoch) return;
    const byStage = new Map(rows.map((r) => [r.stage, r]));
    if (list) {
      list.textContent = "";
      for (const stage of STAGES) {
        const row = byStage.get(stage.key);
        const state = row?.status || "pending";
        const li = document.createElement("li");
        li.className = `portal-stage status-${state}`;
        const node = document.createElement("span");
        node.className = "course-node";
        node.setAttribute("aria-hidden", "true");
        const body = document.createElement("div");
        body.className = "portal-stage-body";
        const label = document.createElement("p");
        label.className = "portal-stage-label";
        label.textContent = stage.label;
        const badge = document.createElement("span");
        badge.className = "portal-stage-badge";
        badge.textContent = { pending: "Not started", in_progress: "In progress", done: "Done" }[state];
        body.append(label, badge);
        if (row?.note) {
          const note = document.createElement("p");
          note.className = "portal-stage-note";
          note.textContent = row.note;
          body.append(note);
        }
        li.append(node, body);
        list.append(li);
      }
    }
    if (rows.length === 0) {
      setStatus(status, "Your course plot is being set. Once Bearing marks your first stage, it appears here.", "info");
    } else {
      setStatus(status, "");
    }
  }

  function renderDocsError() {
    const status = document.querySelector("#docs-status");
    setStatus(status, "We couldn't load your documents just now. Refresh in a moment.", "error");
  }

  async function renderDocuments(session, pilotId) {
    const epoch = sessionEpoch;
    const status = document.querySelector("#docs-status");
    setStatus(status, "Loading your documents…", "info");
    wireUpload();

    // Two non-recursive listings: founder deliverables at the pilot root, and
    // the client's own files under uploads/. Listing the root alone would only
    // surface an `uploads` folder placeholder, never the files inside it.
    const rootPrefix = pilotId;
    const uploadsPrefix = `${pilotId}/uploads`;
    let rootObjects;
    let uploadObjects;
    try {
      [rootObjects, uploadObjects] = await Promise.all([
        listFolder(session, rootPrefix),
        listFolder(session, uploadsPrefix),
      ]);
    } catch {
      if (epoch !== sessionEpoch) return;
      renderDocsError();
      return;
    }
    if (epoch !== sessionEpoch) return;

    // Folder placeholders come back with a null id — keep only real files.
    const fromBearing = rootObjects.filter((o) => o && o.id && o.name);
    const uploads = uploadObjects.filter((o) => o && o.id && o.name);

    fillDocList(rootPrefix, "#docs-bearing", fromBearing, "Nothing from Bearing yet — your deliverables land here.");
    fillDocList(uploadsPrefix, "#docs-uploads", uploads, "You haven't uploaded anything yet.");
    setStatus(status, "");
  }

  function fillDocList(prefix, selector, files, emptyCopy) {
    const container = document.querySelector(selector);
    if (!container) return;
    container.textContent = "";
    if (files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "portal-empty";
      empty.textContent = emptyCopy;
      container.append(empty);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "portal-doc-list";
    for (const file of files) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "portal-doc-link";
      button.textContent = file.name;
      const path = `${prefix}/${file.name}`;
      button.addEventListener("click", () => handleDownload(path, button));
      li.append(button);
      ul.append(li);
    }
    container.append(ul);
  }

  // Refresh the live session if the access token is near expiry, so mid-session
  // actions keep working past the ~1h token lifetime instead of silently
  // failing. Returns a fresh session, or null after a clean sign-out on failure.
  async function ensureFreshSession() {
    if (!activeSession) return null;
    if (!sessionIsExpiring(activeSession, Date.now())) return activeSession;
    const epoch = sessionEpoch;
    let refreshed = null;
    try {
      refreshed = activeSession.refresh_token
        ? await refreshSession(activeSession.refresh_token)
        : null;
    } catch {
      refreshed = null;
    }
    if (epoch !== sessionEpoch) return null;
    if (refreshed?.access_token) {
      activeSession = toSession(refreshed, Date.now());
      saveSession(activeSession);
      return activeSession;
    }
    signOut();
    return null;
  }

  async function handleDownload(path, button) {
    if (!activeSession) return;
    const epoch = sessionEpoch;
    const session = await ensureFreshSession();
    if (epoch !== sessionEpoch || !session) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = `${original} — opening…`;
    try {
      const blob = await downloadDocument(session, path);
      if (epoch !== sessionEpoch) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = path.split("/").pop();
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      const status = document.querySelector("#docs-status");
      setStatus(status, "That download didn't open. Try again in a moment.", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  let uploadWired = false;
  function wireUpload() {
    const form = document.querySelector("#upload-form");
    const input = document.querySelector("#upload-input");
    const submit = document.querySelector("#upload-submit");
    const status = document.querySelector("#upload-status");
    if (!form || uploadWired) return;
    uploadWired = true;

    // Bound once, but reads the live activeSession/activePilotId each time — a
    // sign-out and fresh sign-in never uploads against the previous session.
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const epoch = sessionEpoch;
      if (!activeSession || !activePilotId) {
        setStatus(status, "Your session ended. Sign in again to upload.", "error");
        return;
      }
      const file = input?.files?.[0];
      if (!file) {
        setStatus(status, "Choose a file to upload first.", "error");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setStatus(status, "That file is over 10MB. Please upload a smaller file.", "error");
        return;
      }
      const session = await ensureFreshSession();
      if (epoch !== sessionEpoch) return;
      if (!session) {
        setStatus(status, "Your session ended. Sign in again to upload.", "error");
        return;
      }
      const pilotId = activePilotId;
      submit.disabled = true;
      submit.textContent = "Uploading…";
      setStatus(status, "");
      try {
        await uploadDocument(session, pilotId, file, Date.now());
        if (epoch !== sessionEpoch) return;
        setStatus(status, "Uploaded. It now shows under “Your uploads”.", "info");
        form.reset();
        renderDocuments(session, pilotId);
      } catch {
        if (epoch !== sessionEpoch) return;
        setStatus(status, "That upload didn't finish — your file wasn't sent. Try again in a moment.", "error");
      } finally {
        if (epoch === sessionEpoch) {
          submit.disabled = false;
          submit.textContent = "Upload";
        }
      }
    });
  }

  // Keep the file-input accept list in sync with the documented set.
  const uploadInput = document.querySelector("#upload-input");
  if (uploadInput) uploadInput.setAttribute("accept", UPLOAD_ACCEPT);
}
