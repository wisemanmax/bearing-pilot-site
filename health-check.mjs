import { supabaseUrl, supabaseKey } from "./site-config.mjs";

// The free, public Bearing Business Health Check. This is NOT the paid First
// Bearing assessment — it is a directional, self-scored read that runs entirely
// in the visitor's browser. It stores no answers and asks for no identity. On
// scoring it fires one anonymized, six-number insert (silent, config-gated) and
// autosaves in-progress answers to a single localStorage key.

// Six dimensions of financial-operations health for small businesses and
// non-profits. The `key` values are stable internal identifiers that also name
// the storage columns (dim_cash … dim_owner); the visitor-facing labels below
// describe the finance/non-profit lens they now carry.
export const DIMENSIONS = [
  { key: "cash", label: "Cash & liquidity" },
  { key: "profit", label: "Margins & sustainability" },
  { key: "customers", label: "Funding & revenue" },
  { key: "operations", label: "Financial systems & reporting" },
  { key: "team", label: "Banking & credit" },
  { key: "owner", label: "Governance & controls" },
];

// 18 questions, three per dimension. Answers are 0–3 with concrete, plain-language
// anchors (3 = healthiest). Anchors are listed best-first to match the read
// direction of the example scale ("to the week / to the month / roughly / I don't").
export const QUESTIONS = [
  { key: "cash-1", dim: "cash", text: "The cash I can actually decide with — unrestricted, after what's committed — I know:", anchors: [
    { value: 3, label: "to the week" }, { value: 2, label: "to the month" },
    { value: 1, label: "roughly" }, { value: 0, label: "I honestly don't" } ] },
  { key: "cash-2", dim: "cash", text: "If money stopped coming in tomorrow, how long we could cover payroll and obligations is:", anchors: [
    { value: 3, label: "a number I know exactly" }, { value: 2, label: "a rough number" },
    { value: 1, label: "a vague sense" }, { value: 0, label: "something I can't answer" } ] },
  { key: "cash-3", dim: "cash", text: "The money owed to us — invoices, pledged grants, reimbursements — arrives:", anchors: [
    { value: 3, label: "on time, nearly always" }, { value: 2, label: "mostly on time" },
    { value: 1, label: "late often — I chase" }, { value: 0, label: "late enough to squeeze cash" } ] },

  { key: "profit-1", dim: "profit", text: "The true, fully loaded cost to deliver our main program or product, I know:", anchors: [
    { value: 3, label: "per program or job" }, { value: 2, label: "overall" },
    { value: 1, label: "as a ballpark" }, { value: 0, label: "not really" } ] },
  { key: "profit-2", dim: "profit", text: "Our prices, fees, or grant budgets cover their real costs:", anchors: [
    { value: 3, label: "deliberately, and reviewed" }, { value: 2, label: "mostly" },
    { value: 1, label: "on gut or history" }, { value: 0, label: "by habit — not revisited" } ] },
  { key: "profit-3", dim: "profit", text: "A year out, on the current trajectory, our finances are:", anchors: [
    { value: 3, label: "sustainable, by design" }, { value: 2, label: "probably fine" },
    { value: 1, label: "uncertain" }, { value: 0, label: "heading the wrong way" } ] },

  { key: "customers-1", dim: "customers", text: "Our largest single funder, grant, or customer is:", anchors: [
    { value: 3, label: "under a tenth of income" }, { value: 2, label: "around a fifth" },
    { value: 1, label: "around a third" }, { value: 0, label: "big enough that losing it would threaten us" } ] },
  { key: "customers-2", dim: "customers", text: "Income for the next two quarters — renewals, pipeline, pledges — is:", anchors: [
    { value: 3, label: "known and healthy" }, { value: 2, label: "roughly visible" },
    { value: 1, label: "thin or uncertain" }, { value: 0, label: "not visible at all" } ] },
  { key: "customers-3", dim: "customers", text: "The income that repeats without re-winning it is:", anchors: [
    { value: 3, label: "most of our base" }, { value: 2, label: "a solid share" },
    { value: 1, label: "a small share" }, { value: 0, label: "almost none — always new hunting" } ] },

  { key: "operations-1", dim: "operations", text: "Closing the books each month happens:", anchors: [
    { value: 3, label: "on a schedule, clean" }, { value: 2, label: "most months, a little late" },
    { value: 1, label: "whenever we get to it" }, { value: 0, label: "rarely — it's a scramble" } ] },
  { key: "operations-2", dim: "operations", text: "If a funder, lender, or auditor asked for a report this week, we could produce it:", anchors: [
    { value: 3, label: "same day, confidently" }, { value: 2, label: "with a day or two of work" },
    { value: 1, label: "only with a real scramble" }, { value: 0, label: "not without outside help" } ] },
  { key: "operations-3", dim: "operations", text: "Restricted vs. unrestricted funds — or committed vs. free cash — we track:", anchors: [
    { value: 3, label: "precisely, at any time" }, { value: 2, label: "well enough" },
    { value: 1, label: "loosely" }, { value: 0, label: "we don't really separate it" } ] },

  { key: "team-1", dim: "team", text: "Our banking and lending relationships are:", anchors: [
    { value: 3, label: "strong — they know us and our numbers" }, { value: 2, label: "functional" },
    { value: 1, label: "transactional only" }, { value: 0, label: "strained or unclear" } ] },
  { key: "team-2", dim: "team", text: "If we needed a loan or line of credit, the terms we'd get are:", anchors: [
    { value: 3, label: "something I can predict" }, { value: 2, label: "roughly known" },
    { value: 1, label: "a guess" }, { value: 0, label: "no idea" } ] },
  { key: "team-3", dim: "team", text: "The covenants, fees, and conditions on our accounts and debt, I understand:", anchors: [
    { value: 3, label: "fully" }, { value: 2, label: "mostly" },
    { value: 1, label: "vaguely" }, { value: 0, label: "not at all" } ] },

  { key: "owner-1", dim: "owner", text: "Who can approve, spend, and sign — and up to what limits — is:", anchors: [
    { value: 3, label: "clear and in writing" }, { value: 2, label: "mostly clear" },
    { value: 1, label: "fuzzy at the edges" }, { value: 0, label: "improvised" } ] },
  { key: "owner-2", dim: "owner", text: "The people who record money and the people who move it are:", anchors: [
    { value: 3, label: "separated, with checks" }, { value: 2, label: "mostly separated" },
    { value: 1, label: "the same for a lot of it" }, { value: 0, label: "all one person" } ] },
  { key: "owner-3", dim: "owner", text: "Our board or owners get financials timely and plain enough to act on:", anchors: [
    { value: 3, label: "reliably" }, { value: 2, label: "most of the time" },
    { value: 1, label: "late or hard to read" }, { value: 0, label: "not really" } ] },
];

// Required verbatim on the results view — this is a self-read, not a verdict.
export const HONEST_FRAMING =
  "This is a directional read of your own answers — not a benchmark, an audit, or advice.";

export const STORAGE_KEY = "bearing-health-check";
const SCORES_TABLE = "bearing_health_scores";

// Blank config (either value) disables the anonymized insert entirely, matching
// the rest of the site. The scoring and results view never depend on config.
export function configReady(url, key) {
  return typeof url === "string" && url.trim() !== "" &&
    typeof key === "string" && key.trim() !== "";
}

// Pure scoring. `answers` maps question keys to a 0–3 value; anything missing or
// non-numeric is excluded from its dimension's average. A dimension with no
// answered questions scores null and is excluded from the overall. Returns
// { dimensions:[{key,label,score0to100}], overall0to100, weakest, strongest }.
export function scoreHealthCheck(answers) {
  const source = answers || {};
  const dimensions = DIMENSIONS.map(({ key, label }) => {
    const values = QUESTIONS
      .filter((q) => q.dim === key)
      .map((q) => source[q.key])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return { key, label, score0to100: null };
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return { key, label, score0to100: Math.round((avg / 3) * 100) };
  });

  const scored = dimensions.filter((d) => d.score0to100 !== null);
  const overall0to100 = scored.length === 0
    ? null
    : Math.round(scored.reduce((sum, d) => sum + d.score0to100, 0) / scored.length);

  let weakest = null;
  let strongest = null;
  for (const d of scored) {
    if (weakest === null || d.score0to100 < weakest.score0to100) weakest = d;
    if (strongest === null || d.score0to100 > strongest.score0to100) strongest = d;
  }

  return {
    dimensions,
    overall0to100,
    weakest: weakest ? weakest.key : null,
    strongest: strongest ? strongest.key : null,
  };
}

// Compass needle angle: a semicircle gauge from -90° (score 0, hard left) to
// +90° (score 100, hard right), pointing straight up at 50.
export function needleAngle(score0to100) {
  const clamped = Math.max(0, Math.min(100, score0to100));
  return -90 + (clamped / 100) * 180;
}

// Written read: flashlight-not-lecture. For a dimension, pick the band from its
// own score (the answer pattern), describe what it suggests, and give ONE
// concrete first move.
const READ_TEMPLATES = {
  cash: {
    low: "Your answers point to cash you're steering partly blind — how much you can actually decide with, how long it lasts, or how fast it arrives isn't visible enough to plan against. That's the gap that turns a normal slow month into a scramble. First move: build a one-page, 13-week cash forecast — unrestricted only — and update it every Friday, even roughly.",
    moderate: "You have a working handle on cash, but there's slack in the picture — one of position, runway, or collections is a “roughly” rather than a known number. Tightening it buys earlier warning. First move: make the softest of the three exact this week.",
    high: "Your cash picture is strong: position, runway, and collections are visible enough to steer by. Keep that advantage by refreshing the numbers on a fixed weekly rhythm.",
  },
  profit: {
    low: "The answers suggest sustainability is something you feel more than see — the true cost to deliver, whether prices or grant budgets cover it, or where the trajectory leads isn't backed by numbers yet. Income can climb while the operation quietly loses ground. First move: fully cost your main program or product, then check what that says about your pricing or budget.",
    moderate: "You know the operation broadly works, but one of true cost, pricing, or the forward trajectory is still a hunch. First move: fully cost your biggest program or product line and decide, on purpose, whether it pays for itself.",
    high: "Your sustainability picture is strong: costs, pricing or budgets, and the forward trajectory are grounded in numbers. Keep testing those assumptions as the mix changes.",
  },
  customers: {
    low: "Your answers flag funding risk — one funder or customer carries too much weight, the pipeline is thin, or income doesn't repeat. Any one of those makes the whole operation fragile. First move: write down what share of income your largest single source is; if it's near a third or more, start one concrete step toward a second anchor.",
    moderate: "The funding base is holding, but there's a soft spot — concentration, pipeline, or renewals aren't as strong as the rest. First move: look at the next two quarters of known income, and if it's thin, block time each week for cultivation or outreach before you need it.",
    high: "Your funding and revenue base is strong: concentration is controlled, the next two quarters are visible, and repeat income provides ballast. Keep watching the mix before it shifts.",
  },
  operations: {
    low: "The answers suggest the books tell you the story late — a slow close, reports that take a scramble, or restricted and free money that blur together. That's the gap that fails a funder review or hides a problem until it's expensive. First move: set a fixed monthly close date and produce one clean report by it, even a rough one.",
    moderate: "Your reporting mostly works, but one piece — the close, an on-demand report, or the restricted/unrestricted split — isn't as tight as a funder or lender would want. First move: pick that one and make it audit-ready this month.",
    high: "Your financial systems and reporting are strong: the books close cleanly, reports are ready, and committed money stays distinct from free cash. Protect that cadence as volume grows.",
  },
  team: {
    low: "Your answers point to banking and credit you're navigating without a map — the relationship is transactional, the terms are a guess, or the conditions on your accounts and debt aren't clear. That's expensive exactly when you need capital most. First move: book a review with your banker and walk out knowing what they'd lend, on what terms, and what they want to see.",
    moderate: "The banking relationship is functional, but you're not using it as a partner — one of the relationship, the likely terms, or the fine print is fuzzy. First move: pick the fuzziest and get it in writing from your bank this quarter.",
    high: "Your banking and credit footing is strong: the relationship, likely terms, and account conditions are clear before you need them. Keep the relationship warm with regular updates.",
  },
  owner: {
    low: "The answers suggest financial control leans on trust more than structure — approvals, separation of duties, or board-ready financials aren't really in place. That's the setup that invites both honest error and, eventually, an uncomfortable question. First move: write down who can approve and spend, with limits, and separate whoever records money from whoever moves it.",
    moderate: "Your controls mostly hold, but there's a gap — an approval limit, a separation of duties, or a board report — that would show under scrutiny. First move: close the single gap that would most worry an auditor or a funder.",
    high: "Your governance and controls are strong: authority is clear, duties are separated, and decision-makers get usable financials. Keep those safeguards written and current.",
  },
};

export function writtenRead(result) {
  const scored = result.dimensions.filter((d) => d.score0to100 !== null);
  const weakestTwo = [...scored]
    .sort((a, b) => a.score0to100 - b.score0to100)
    .slice(0, 2);
  return weakestTwo.map((d) => {
    const band = d.score0to100 >= 75 ? "high" : d.score0to100 < 50 ? "low" : "moderate";
    return { key: d.key, label: d.label, text: READ_TEMPLATES[d.key][band] };
  });
}

// Fire-and-forget, anonymized insert: six dimension scores plus the overall.
// No answers, no free text, no identifiers. Silent on any failure and skipped
// entirely when config is blank or nothing scored.
export async function recordHealthScore(
  result,
  url = supabaseUrl,
  key = supabaseKey,
  request = globalThis.fetch,
) {
  if (!configReady(url, key)) return false;
  if (result.overall0to100 === null) return false;
  const byKey = {};
  for (const d of result.dimensions) byKey[d.key] = d.score0to100;
  const payload = {
    overall: result.overall0to100,
    dim_cash: byKey.cash,
    dim_profit: byKey.profit,
    dim_customers: byKey.customers,
    dim_operations: byKey.operations,
    dim_team: byKey.team,
    dim_owner: byKey.owner,
  };
  try {
    const response = await request(`${url.replace(/\/+$/, "")}/rest/v1/${SCORES_TABLE}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// --- localStorage autosave (best-effort; never blocks the read) ---
function safeSet(value) {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* best-effort */ }
}
function safeGet() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function safeRemove() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
}

// --- Browser wiring (skipped under Node so scoring stays pure/importable) ---
function collectAnswers(form) {
  const answers = {};
  for (const q of QUESTIONS) {
    const checked = form.querySelector(`input[name="${q.key}"]:checked`);
    if (checked) answers[q.key] = Number(checked.value);
  }
  return answers;
}

// The overall score counts up to its value when motion is welcome — the
// number arriving is the payoff beat. Assistive tech reads the final score
// from the figure's label, never the ticking digits.
let countRaf = 0;
let countTimer = 0;
function showOverall(overallText, finalScore) {
  const figure = overallText.closest(".hc-overall-figure");
  if (figure) {
    figure.setAttribute("aria-label", `${finalScore} out of 100 overall`);
    for (const child of figure.children) child.setAttribute("aria-hidden", "true");
  }
  if (countRaf) cancelAnimationFrame(countRaf);
  if (countTimer) clearTimeout(countTimer);
  countRaf = 0;
  countTimer = 0;
  const reduceMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || typeof requestAnimationFrame !== "function") {
    overallText.textContent = String(finalScore);
    return;
  }
  const started = performance.now();
  const DURATION = 650;
  overallText.textContent = "0";
  const tick = (now) => {
    const t = Math.min(1, (now - started) / DURATION);
    const eased = 1 - (1 - t) ** 3;
    overallText.textContent = String(Math.round(eased * finalScore));
    if (t < 1) {
      countRaf = requestAnimationFrame(tick);
    } else {
      countRaf = 0;
      clearTimeout(countTimer);
      countTimer = 0;
    }
  };
  countRaf = requestAnimationFrame(tick);
  // rAF can be throttled to a standstill (hidden or backgrounded tabs); the
  // score must never be the casualty — settle to the real number regardless.
  countTimer = setTimeout(() => {
    if (countRaf) cancelAnimationFrame(countRaf);
    countRaf = 0;
    countTimer = 0;
    overallText.textContent = String(finalScore);
  }, DURATION + 200);
}

function renderResults(result, root) {
  const needle = root.querySelector("#hc-needle");
  const overallText = root.querySelector("#hc-overall");
  if (result.overall0to100 !== null) {
    if (needle) needle.setAttribute("transform", `rotate(${needleAngle(result.overall0to100)} 100 100)`);
    if (overallText) showOverall(overallText, result.overall0to100);
  }

  const bars = root.querySelector("#hc-bars");
  if (bars) {
    bars.textContent = "";
    for (const d of result.dimensions) {
      const row = document.createElement("div");
      row.className = "hc-bar-row";
      const label = document.createElement("span");
      label.className = "hc-bar-label";
      label.textContent = d.label;
      const track = document.createElement("span");
      track.className = "hc-bar-track";
      const fill = document.createElement("span");
      fill.className = "hc-bar-fill";
      const value = document.createElement("span");
      value.className = "hc-bar-value";
      if (d.score0to100 === null) {
        fill.style.width = "0%";
        value.textContent = "—";
        row.dataset.answered = "false";
      } else {
        fill.style.width = d.score0to100 + "%";
        value.textContent = String(d.score0to100);
      }
      track.appendChild(fill);
      row.append(label, track, value);
      bars.appendChild(row);
    }
  }

  const read = root.querySelector("#hc-read");
  if (read) {
    read.textContent = "";
    for (const item of writtenRead(result)) {
      const h = document.createElement("h3");
      h.textContent = item.label;
      const p = document.createElement("p");
      p.textContent = item.text;
      read.append(h, p);
    }
  }
}

function initHealthCheck() {
  const form = document.querySelector("#health-form");
  const results = document.querySelector("#health-results");
  const empty = document.querySelector("#health-empty");
  const freshStart = document.querySelector("#health-fresh-start");
  if (!form || !results) return;

  function restore() {
    const raw = safeGet();
    if (!raw) return;
    let saved;
    try { saved = JSON.parse(raw); } catch { return; }
    for (const q of QUESTIONS) {
      const stored = saved[q.key];
      const v = typeof stored === "number" ||
          (typeof stored === "string" && stored.trim() !== "")
        ? Number(stored)
        : NaN;
      if (!Number.isInteger(v) || v < 0 || v > 3) continue;
      const input = form.querySelector(`input[name="${q.key}"][value="${v}"]`);
      if (input) input.checked = true;
    }
  }

  form.addEventListener("input", () => {
    safeSet(JSON.stringify(collectAnswers(form)));
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const answers = collectAnswers(form);
    if (Object.keys(answers).length === 0) {
      if (empty) empty.hidden = false;
      results.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    const result = scoreHealthCheck(answers);
    renderResults(result, results);
    results.hidden = false;
    results.focus();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    results.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    // Anonymized, silent, config-gated. Never awaited — the read is already shown.
    void recordHealthScore(result);
  });

  if (freshStart) {
    freshStart.addEventListener("click", () => {
      safeRemove();
      form.reset();
      results.hidden = true;
      if (empty) empty.hidden = true;
    });
  }

  restore();
}

if (typeof document !== "undefined") {
  initHealthCheck();
}
