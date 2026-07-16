// Bearing admin — the founder's dashboard at /admin.html. Same machinery as
// the client portal (email OTP, publishable key, RLS) with one difference:
// every read/write here is gated server-side by private.is_bearing_admin()
// (migration 0013), so this page is useless to anyone whose email is not in
// bearing_admins — including signed-in portal clients. The page holds no
// secrets; RLS is the gate, this is just the steering console.
//
// All user-submitted data is rendered with textContent — never innerHTML.

import { supabaseKey, supabaseUrl } from "./site-config.mjs";

const SESSION_KEY = "bearing-admin-session";
const REFRESH_MARGIN_MS = 60_000;
const FLOW_RUNNER_URL = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/bearing-flow-runner`;

export const PILOT_IDS = ["PILOT-01", "PILOT-02", "PILOT-03", "PILOT-04", "PILOT-05"];
export const STAGES = [
  "booked", "paid", "assessment_received", "analysis",
  "delivered", "debrief_scheduled", "debriefed", "followup",
];
export const STATUSES = ["pending", "in_progress", "done"];

// --- Pure helpers (unit-tested) ---------------------------------------------

export function configReady(url = supabaseUrl, key = supabaseKey) {
  return typeof url === "string" && url.trim() !== "" &&
    typeof key === "string" && key.trim() !== "";
}

export function sessionIsExpiring(session, nowMs) {
  if (!session || typeof session.expires_at !== "number") return true;
  return nowMs >= session.expires_at - REFRESH_MARGIN_MS;
}

// One-time intake code: 32 hex chars from crypto randomness.
export function makeInviteToken(randomUUID = () => crypto.randomUUID()) {
  return (randomUUID() + randomUUID()).replace(/-/g, "").slice(0, 32);
}

export function inviteLink(token, base = "") {
  return `${base}assessment.html?t=${encodeURIComponent(token)}`;
}

// Short local timestamp for tables: "Jul 16, 10:42 AM".
export function formatWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// Booking windows jsonb -> "Thu Jul 16 2:00 PM · Mon Jul 20 10:00 AM".
export function describeWindows(windows) {
  if (!Array.isArray(windows) || windows.length === 0) return "—";
  return windows
    .map((w) => [w?.label || w?.date || w?.day, w?.time].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ");
}

export function countBy(rows, key) {
  const out = {};
  for (const row of rows || []) {
    const value = row?.[key] ?? "—";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

// --- Session + REST plumbing -------------------------------------------------

const apiBase = () => supabaseUrl.replace(/\/+$/, "");

function loadSession() {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveSession(session) {
  try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* no-op */ }
}
function clearSession() {
  try { globalThis.localStorage?.removeItem(SESSION_KEY); } catch { /* no-op */ }
}

function toSession(token, nowMs) {
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: nowMs + (Number(token.expires_in) || 0) * 1000,
    email: token.user?.email || "",
  };
}

async function requestOtp(email) {
  const response = await fetch(`${apiBase()}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: false }),
  });
  return response.ok;
}

async function verifyOtp(email, token) {
  const response = await fetch(`${apiBase()}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "email", email, token }),
  });
  return response.ok ? response.json() : null;
}

async function refreshSession(refreshToken) {
  const response = await fetch(`${apiBase()}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return response.ok ? response.json() : null;
}

// --- DOM ----------------------------------------------------------------------

if (typeof document !== "undefined") {
  initAdmin();
}

function initAdmin() {
  const views = {
    closed: document.querySelector("#admin-closed"),
    login: document.querySelector("#admin-login"),
    denied: document.querySelector("#admin-denied"),
    dash: document.querySelector("#admin-dash"),
  };
  if (!views.login) return;

  const show = (name) => {
    for (const [key, el] of Object.entries(views)) if (el) el.hidden = key !== name;
  };

  if (!configReady()) { show("closed"); return; }

  let session = null;

  const authHeaders = () => ({
    apikey: supabaseKey,
    Authorization: `Bearer ${session.access_token}`,
  });

  async function ensureFresh() {
    if (!session) return false;
    if (!sessionIsExpiring(session, Date.now())) return true;
    const refreshed = session.refresh_token ? await refreshSession(session.refresh_token).catch(() => null) : null;
    if (refreshed?.access_token) {
      session = toSession(refreshed, Date.now());
      saveSession(session);
      return true;
    }
    signOut();
    return false;
  }

  async function rest(path, init = {}) {
    if (!(await ensureFresh())) throw new Error("signed-out");
    const response = await fetch(`${apiBase()}/rest/v1/${path}`, {
      ...init,
      headers: { ...authHeaders(), "Content-Type": "application/json", ...(init.headers || {}) },
    });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  function signOut() {
    const token = session?.access_token;
    if (token) {
      fetch(`${apiBase()}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    clearSession();
    session = null;
    show("login");
  }

  document.querySelector("#admin-signout")?.addEventListener("click", signOut);
  document.querySelector("#admin-denied-signout")?.addEventListener("click", signOut);

  // --- Login flow (email -> code), mirroring the portal ----------------------
  const emailForm = document.querySelector("#admin-email-form");
  const emailInput = document.querySelector("#admin-email");
  const emailStatus = document.querySelector("#admin-email-status");
  const codeForm = document.querySelector("#admin-code-form");
  const codeInput = document.querySelector("#admin-code");
  const codeStatus = document.querySelector("#admin-code-status");
  let pendingEmail = "";

  const setStatus = (el, message) => {
    if (!el) return;
    el.textContent = message;
    el.hidden = message === "";
  };

  emailForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = (emailInput?.value || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setStatus(emailStatus, "Enter the admin email address.");
      return;
    }
    setStatus(emailStatus, "");
    let networkError = false;
    try { await requestOtp(email); } catch { networkError = true; }
    if (networkError) {
      setStatus(emailStatus, "Couldn't reach the server. Try again in a moment.");
      return;
    }
    pendingEmail = email;
    emailForm.hidden = true;
    if (codeForm) codeForm.hidden = false;
    setStatus(codeStatus, "If that address is registered, a 6-digit code is on its way.");
    codeInput?.focus();
  });

  codeForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = (codeInput?.value || "").trim();
    if (!code) return;
    const token = await verifyOtp(pendingEmail, code).catch(() => null);
    if (!token?.access_token) {
      setStatus(codeStatus, "That code didn't match — try again or request a new one.");
      return;
    }
    session = toSession(token, Date.now());
    saveSession(session);
    enter();
  });

  // Resume an existing admin session on load.
  (async () => {
    const stored = loadSession();
    if (!stored) { show("login"); return; }
    session = stored;
    if (await ensureFresh()) enter();
  })();

  // --- Dashboard ---------------------------------------------------------------
  async function enter() {
    // The probe: admins can read exactly their own allowlist row (0014).
    let probe = [];
    try { probe = await rest("bearing_admins?select=email&limit=1"); } catch { probe = []; }
    if (!Array.isArray(probe) || probe.length === 0) { show("denied"); return; }
    show("dash");
    const who = document.querySelector("#admin-who");
    if (who) who.textContent = session.email;
    loadAll();
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function fillTable(selector, rows, columns, empty) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    tbody.textContent = "";
    if (!rows.length) {
      const tr = el("tr");
      const td = el("td", "admin-empty", empty);
      td.colSpan = columns;
      tr.append(td);
      tbody.append(tr);
    }
    return tbody;
  }

  async function loadAll() {
    await Promise.all([
      loadInbox(), loadSignals(), loadPilots(), loadFlows(),
    ]).catch(() => {});
  }

  // --- Inbox: contact + booking + newsletter ---------------------------------
  async function loadInbox() {
    const [contacts, bookings, signups] = await Promise.all([
      rest("bearing_contact_messages?select=id,created_at,name,email,message,honeypot_tripped,handled_at&order=created_at.desc&limit=50").catch(() => []),
      rest("bearing_booking_requests?select=id,created_at,name,email,business_name,note,timezone,windows,honeypot_tripped,handled_at&order=created_at.desc&limit=50").catch(() => []),
      rest("bearing_newsletter_signups?select=created_at,email,source_page,honeypot_tripped&order=created_at.desc&limit=100").catch(() => []),
    ]);

    const openCount = [...contacts, ...bookings].filter((r) => !r.handled_at && !r.honeypot_tripped).length;
    const stat = document.querySelector("#stat-inbox");
    if (stat) stat.textContent = String(openCount);
    const statNews = document.querySelector("#stat-newsletter");
    if (statNews) statNews.textContent = String(signups.filter((s) => !s.honeypot_tripped).length);

    const tbody = fillTable("#inbox-body", [...contacts.map((c) => ({ ...c, kind: "contact" })), ...bookings.map((b) => ({ ...b, kind: "booking" }))]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), 5, "Nothing yet — the inbox fills as forms are submitted.");
    if (!tbody) return;

    const items = [...contacts.map((c) => ({ ...c, kind: "contact" })), ...bookings.map((b) => ({ ...b, kind: "booking" }))]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    for (const item of items) {
      const tr = el("tr", item.handled_at ? "is-handled" : "");
      tr.append(
        el("td", "admin-when", formatWhen(item.created_at)),
        el("td", `admin-kind admin-kind-${item.kind}`, item.kind === "booking" ? "Booking" : "Contact"),
        el("td", "", `${item.name || "—"} <${item.email || "—"}>${item.honeypot_tripped ? " · BOT?" : ""}`),
      );
      const detail = el("td", "admin-detail");
      detail.textContent = item.kind === "booking"
        ? `${item.timezone || ""} · ${describeWindows(item.windows)}${item.note ? ` · ${item.note}` : ""}`
        : (item.message || "");
      tr.append(detail);
      const actions = el("td", "admin-actions");
      if (!item.handled_at) {
        const btn = el("button", "admin-btn", "Mark handled");
        btn.type = "button";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const table = item.kind === "booking" ? "bearing_booking_requests" : "bearing_contact_messages";
          await rest(`${table}?id=eq.${item.id}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ handled_at: new Date().toISOString() }),
          }).catch(() => { btn.disabled = false; });
          loadInbox();
        });
        actions.append(btn);
      } else {
        actions.append(el("span", "admin-done", "Handled"));
      }
      tr.append(actions);
      tbody.append(tr);
    }

    const newsBody = fillTable("#newsletter-body", signups, 3, "No signups yet.");
    if (newsBody) {
      for (const s of signups) {
        const tr = el("tr");
        tr.append(
          el("td", "admin-when", formatWhen(s.created_at)),
          el("td", "", s.email + (s.honeypot_tripped ? " · BOT?" : "")),
          el("td", "admin-detail", s.source_page || "—"),
        );
        newsBody.append(tr);
      }
    }
  }

  // --- Demand signals ----------------------------------------------------------
  async function loadSignals() {
    const [firstLook, health, receipts] = await Promise.all([
      rest("bearing_first_look?select=band,created_at&order=created_at.desc&limit=200").catch(() => []),
      rest("bearing_health_scores?select=overall,created_at&order=created_at.desc&limit=200").catch(() => []),
      rest("bearing_intake_receipts?select=pilot_id,created_at&order=created_at.desc&limit=20").catch(() => []),
    ]);
    const bands = countBy(firstLook, "band");
    const bandsEl = document.querySelector("#signal-bands");
    if (bandsEl) {
      bandsEl.textContent = ["adrift", "oriented", "steady", "advancing"]
        .map((b) => `${b} ${bands[b] || 0}`).join(" · ");
    }
    const statFl = document.querySelector("#stat-firstlook");
    if (statFl) statFl.textContent = String(firstLook.length);
    const statHc = document.querySelector("#stat-health");
    if (statHc) statHc.textContent = String(health.length);
    const receiptsEl = document.querySelector("#signal-receipts");
    if (receiptsEl) {
      receiptsEl.textContent = receipts.length
        ? receipts.map((r) => `${r.pilot_id} ${formatWhen(r.created_at)}`).join(" · ")
        : "No assessments received yet.";
    }
  }

  // --- Pilots: members, course plot, invites -----------------------------------
  async function loadPilots() {
    const [members, progress, invites] = await Promise.all([
      rest("bearing_portal_members?select=email,pilot_id").catch(() => []),
      rest("bearing_portal_progress?select=pilot_id,stage,status,note&order=pilot_id.asc").catch(() => []),
      rest("bearing_intake_invites?select=pilot_id,token").catch(() => []),
    ]);

    const wrap = document.querySelector("#pilots-wrap");
    if (!wrap) return;
    wrap.textContent = "";

    for (const pilotId of PILOT_IDS) {
      const card = el("section", "admin-pilot");
      const head = el("h3", "", pilotId);
      const member = members.find((m) => m.pilot_id === pilotId);
      head.append(el("span", "admin-pilot-member", member ? ` ${member.email}` : " — no member yet"));
      card.append(head);

      // Stage editor row: stage select + status select + note + save (upsert).
      const rowsFor = progress.filter((p) => p.pilot_id === pilotId);
      const plot = el("p", "admin-plot");
      plot.textContent = rowsFor.length
        ? rowsFor.map((r) => `${r.stage}:${r.status}`).join(" · ")
        : "No stages set.";
      card.append(plot);

      const form = el("form", "admin-stage-form");
      const stageSel = document.createElement("select");
      for (const s of STAGES) stageSel.append(new Option(s, s));
      const statusSel = document.createElement("select");
      for (const s of STATUSES) statusSel.append(new Option(s, s));
      const noteIn = document.createElement("input");
      noteIn.type = "text";
      noteIn.placeholder = "note shown to the client (optional)";
      noteIn.maxLength = 500;
      const save = el("button", "admin-btn", "Set stage");
      save.type = "submit";
      form.append(stageSel, statusSel, noteIn, save);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        save.disabled = true;
        await rest("bearing_portal_progress?on_conflict=pilot_id,stage", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            pilot_id: pilotId,
            stage: stageSel.value,
            status: statusSel.value,
            note: noteIn.value.trim() || null,
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {});
        save.disabled = false;
        loadPilots();
      });
      card.append(form);

      // Invites: list + create + revoke.
      const inv = invites.filter((i) => i.pilot_id === pilotId);
      const invWrap = el("div", "admin-invites");
      for (const i of inv) {
        const line = el("p", "admin-invite");
        const link = inviteLink(i.token);
        line.append(el("code", "", link));
        const copy = el("button", "admin-btn admin-btn-small", "Copy");
        copy.type = "button";
        copy.addEventListener("click", () => {
          navigator.clipboard?.writeText(new URL(link, location.href).href).catch(() => {});
          copy.textContent = "Copied";
          setTimeout(() => { copy.textContent = "Copy"; }, 1500);
        });
        const revoke = el("button", "admin-btn admin-btn-small", "Revoke");
        revoke.type = "button";
        revoke.addEventListener("click", async () => {
          revoke.disabled = true;
          await rest(`bearing_intake_invites?pilot_id=eq.${pilotId}&token=eq.${encodeURIComponent(i.token)}`, {
            method: "DELETE", headers: { Prefer: "return=minimal" },
          }).catch(() => {});
          loadPilots();
        });
        line.append(copy, revoke);
        invWrap.append(line);
      }
      const newInvite = el("button", "admin-btn", "New assessment invite");
      newInvite.type = "button";
      newInvite.addEventListener("click", async () => {
        newInvite.disabled = true;
        await rest("bearing_intake_invites", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ pilot_id: pilotId, token: makeInviteToken() }),
        }).catch(() => {});
        loadPilots();
      });
      invWrap.append(newInvite);
      card.append(invWrap);
      wrap.append(card);
    }
  }

  // --- Flows + reminder queue ---------------------------------------------------
  async function loadFlows() {
    const [flows, log] = await Promise.all([
      rest("bearing_client_flows?select=id,pilot_id,title,active,started_at&order=started_at.desc").catch(() => []),
      rest("bearing_flow_log?select=executed_at,pilot_id,action,detail&order=executed_at.desc&limit=40").catch(() => []),
    ]);

    const flowsBody = fillTable("#flows-body", flows, 4, "No flows yet — see operations/FLOW-RUNNER.md for the template.");
    if (flowsBody) {
      for (const f of flows) {
        const tr = el("tr");
        tr.append(
          el("td", "", f.pilot_id),
          el("td", "", f.title),
          el("td", "admin-when", formatWhen(f.started_at)),
        );
        const td = el("td", "admin-actions");
        const toggle = el("button", "admin-btn admin-btn-small", f.active ? "Pause" : "Resume");
        toggle.type = "button";
        toggle.addEventListener("click", async () => {
          toggle.disabled = true;
          await rest(`bearing_client_flows?id=eq.${f.id}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ active: !f.active }),
          }).catch(() => {});
          loadFlows();
        });
        td.append(toggle);
        tr.append(td);
        flowsBody.append(tr);
      }
    }

    const logBody = fillTable("#flowlog-body", log, 3, "Nothing executed yet.");
    if (logBody) {
      for (const entry of log) {
        const tr = el("tr", entry.action === "founder_note" ? "is-reminder" : "");
        tr.append(
          el("td", "admin-when", formatWhen(entry.executed_at)),
          el("td", "", `${entry.pilot_id} · ${entry.action}`),
          el("td", "admin-detail", entry.detail || ""),
        );
        logBody.append(tr);
      }
    }
  }

  const runBtn = document.querySelector("#run-flows");
  const runStatus = document.querySelector("#run-flows-status");
  runBtn?.addEventListener("click", async () => {
    runBtn.disabled = true;
    if (runStatus) { runStatus.hidden = false; runStatus.textContent = "Running…"; }
    try {
      const response = await fetch(FLOW_RUNNER_URL, { method: "POST" });
      const result = await response.json();
      if (runStatus) runStatus.textContent = `Done — ${result.flows} flow(s) checked, ${result.executed} step(s) executed.`;
    } catch {
      if (runStatus) runStatus.textContent = "The runner didn't respond — try again in a moment.";
    }
    runBtn.disabled = false;
    loadFlows();
    loadPilots();
  });

  document.querySelector("#admin-refresh")?.addEventListener("click", () => loadAll());
}
