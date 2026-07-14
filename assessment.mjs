import { supabaseUrl, supabaseKey } from "./site-config.mjs";

// The First Bearing written assessment. WRITE-ONLY: it inserts one receipt into
// bearing_intake_receipts and never reads anything back. Drafts live only in the
// visitor's own browser (localStorage), keyed by pilot ID, so a half-finished
// assessment survives a refresh and is cleared once the receipt is stored.

export const PILOT_IDS = ["PILOT-01", "PILOT-02", "PILOT-03", "PILOT-04", "PILOT-05"];
export const SECTIONS = ["money", "customers", "operations", "priorities"];
export const DRAFT_PREFIX = "bearing-assessment-draft:";
const RECEIPTS_TABLE = "bearing_intake_receipts";

// Blank config (either value) disables submission entirely, matching bookingUrl.
export function configReady(url, key) {
  return typeof url === "string" && url.trim() !== "" &&
    typeof key === "string" && key.trim() !== "";
}

export function draftKey(pilotId) {
  return DRAFT_PREFIX + pilotId;
}

// The one-time access code carried in the personal assessment link (?t=…).
// Intake is gated on it server-side, so a link without a valid code cannot
// submit a receipt or start a delivery clock.
export function inviteToken(search) {
  const query = typeof search === "string"
    ? search
    : (typeof location !== "undefined" ? location.search : "");
  try {
    return new URLSearchParams(query).get("t") || "";
  } catch {
    return "";
  }
}

// Gate: a real pilot ID plus at least one answered question in every section.
// "I don't know" is an answer, so a checked don't-know box satisfies a section.
export function validateSubmission(pilotId, answeredSections) {
  if (!PILOT_IDS.includes(pilotId)) {
    return { ok: false, message: "Choose your pilot ID before submitting." };
  }
  const missing = SECTIONS.filter((section) => !answeredSections[section]);
  if (missing.length > 0) {
    return {
      ok: false,
      message: "Answer at least one question in every section before submitting — “I don't know” counts.",
    };
  }
  return { ok: true };
}

// Local storage can throw (private mode, disabled storage). Never let a failed
// draft save cost the visitor their place or block submission.
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* draft is best-effort */ }
}
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to do */ }
}

function snapshot(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.name === "pilot-id") continue;
    data[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return data;
}

function applySnapshot(form, data) {
  for (const el of form.elements) {
    if (!el.name || el.name === "pilot-id" || !(el.name in data)) continue;
    if (el.type === "checkbox") el.checked = Boolean(data[el.name]);
    else el.value = data[el.name];
  }
}

function clearAnswers(form) {
  for (const el of form.elements) {
    if (!el.name || el.name === "pilot-id") continue;
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  }
}

function sectionAnswered(form, section) {
  const prefix = section + "-";
  for (const el of form.elements) {
    if (!el.name || !el.name.startsWith(prefix)) continue;
    if (el.type === "checkbox") {
      if (el.checked) return true;
    } else if (el.value && el.value.trim() !== "") {
      return true;
    }
  }
  return false;
}

async function submitReceipt(pilotId, answers, token) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${RECEIPTS_TABLE}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ pilot_id: pilotId, answers, invite_token: token }),
  });
  if (!response.ok) {
    throw new Error(`intake insert failed: ${response.status}`);
  }
}

function initAssessment() {
  const form = document.querySelector("#assessment-form");
  const closed = document.querySelector("#assessment-closed");
  const success = document.querySelector("#assessment-success");
  const pilotSelect = document.querySelector("#pilot-id");
  const submitButton = document.querySelector("#assessment-submit");
  const status = document.querySelector("#assessment-status");
  const draftNote = document.querySelector("#draft-note");
  if (!form || !pilotSelect || !submitButton) return;

  // Honest closed state when the backend isn't wired up yet.
  if (!configReady(supabaseUrl, supabaseKey)) {
    form.hidden = true;
    if (closed) closed.hidden = false;
    return;
  }

  // Intake is invite-gated: without the one-time code from the personal link,
  // the server rejects the receipt, so ask for the right link up front.
  const token = inviteToken();
  if (!token) {
    form.hidden = true;
    const needsInvite = document.querySelector("#assessment-needs-invite");
    if (needsInvite) needsInvite.hidden = false;
    return;
  }

  function setStatus(message, tone) {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone || "";
  }

  // Once a receipt is stored we must never recreate the draft — a debounced
  // autosave scheduled just before submit could otherwise fire afterwards.
  let submitted = false;
  let saveTimer = null;
  // The pilot ID the current form answers belong to, so a switch flushes the
  // in-progress draft under the OLD id before restoring the new one.
  let currentPilotId = pilotSelect.value;

  // Write the current form answers under an explicit pilot ID. Taking the ID as
  // an argument (rather than re-reading the select) is what makes a scheduled
  // save safe across a pilot switch.
  function writeDraft(pilotId) {
    if (submitted) return;
    if (!PILOT_IDS.includes(pilotId)) return;
    safeSet(draftKey(pilotId), JSON.stringify(snapshot(form)));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    const pilotIdAtSchedule = pilotSelect.value;
    saveTimer = setTimeout(() => writeDraft(pilotIdAtSchedule), 400);
  }

  function loadDraft() {
    const pilotId = pilotSelect.value;
    if (!PILOT_IDS.includes(pilotId)) {
      if (draftNote) draftNote.textContent = "";
      return;
    }
    const raw = safeGet(draftKey(pilotId));
    if (!raw) {
      clearAnswers(form);
      if (draftNote) draftNote.textContent = "Starting a fresh assessment for " + pilotId + ".";
      return;
    }
    try {
      applySnapshot(form, JSON.parse(raw));
      if (draftNote) draftNote.textContent = "Draft restored for " + pilotId + ". Pick up where you left off.";
    } catch {
      if (draftNote) draftNote.textContent = "";
    }
  }

  form.addEventListener("input", (event) => {
    if (event.target === pilotSelect) return;
    scheduleSave();
  });

  pilotSelect.addEventListener("change", () => {
    // Cancel any pending save, then flush the current answers under the OLD
    // pilot ID before switching — so nothing is lost or misattributed.
    clearTimeout(saveTimer);
    writeDraft(currentPilotId);
    currentPilotId = pilotSelect.value;
    loadDraft();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pilotId = pilotSelect.value;
    const answered = {};
    for (const section of SECTIONS) answered[section] = sectionAnswered(form, section);

    const check = validateSubmission(pilotId, answered);
    if (!check.ok) {
      setStatus(check.message, "warn");
      return;
    }

    writeDraft(pilotId);
    submitButton.disabled = true;
    setStatus("Sending your assessment…", "pending");
    try {
      await submitReceipt(pilotId, snapshot(form), token);
      // Stop any pending autosave before clearing, so it can't recreate the draft.
      submitted = true;
      clearTimeout(saveTimer);
      safeRemove(draftKey(pilotId));
      form.hidden = true;
      if (success) {
        success.hidden = false;
        success.focus();
      }
    } catch {
      submitButton.disabled = false;
      setStatus(
        "We couldn't send that just now. Your answers are saved on this device — check your connection and try again in a moment.",
        "error",
      );
    }
  });

  // A returning visitor may land with a pilot already selected (browser restore).
  loadDraft();
}

if (typeof document !== "undefined") {
  initAssessment();
}
