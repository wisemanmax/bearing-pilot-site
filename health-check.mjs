import { supabaseUrl, supabaseKey } from "./site-config.mjs";

// The free, public Bearing Business Health Check. This is NOT the paid First
// Bearing assessment — it is a directional, self-scored read that runs entirely
// in the visitor's browser. It stores no answers and asks for no identity. On
// scoring it fires one anonymized, six-number insert (silent, config-gated) and
// autosaves in-progress answers to a single localStorage key.

export const DIMENSIONS = [
  { key: "cash", label: "Cash" },
  { key: "profit", label: "Profit" },
  { key: "customers", label: "Customers" },
  { key: "operations", label: "Operations" },
  { key: "team", label: "Team" },
  { key: "owner", label: "Owner" },
];

// 18 questions, three per dimension. Answers are 0–3 with concrete, plain-language
// anchors (3 = healthiest). Anchors are listed best-first to match the read
// direction of the example scale ("to the week / to the month / roughly / I don't").
export const QUESTIONS = [
  { key: "cash-1", dim: "cash", text: "I know our cash position at any moment:", anchors: [
    { value: 3, label: "to the week" }, { value: 2, label: "to the month" },
    { value: 1, label: "roughly" }, { value: 0, label: "I honestly don't" } ] },
  { key: "cash-2", dim: "cash", text: "If income stopped tomorrow, how long we could cover payroll and bills is:", anchors: [
    { value: 3, label: "a number I know exactly" }, { value: 2, label: "a rough number" },
    { value: 1, label: "a vague sense" }, { value: 0, label: "something I can't answer" } ] },
  { key: "cash-3", dim: "cash", text: "Customers pay us:", anchors: [
    { value: 3, label: "on time, nearly always" }, { value: 2, label: "mostly on time" },
    { value: 1, label: "late often — I chase" }, { value: 0, label: "late enough to squeeze cash" } ] },

  { key: "profit-1", dim: "profit", text: "I know the profit margin on what we sell:", anchors: [
    { value: 3, label: "per product or job" }, { value: 2, label: "overall" },
    { value: 1, label: "as a ballpark" }, { value: 0, label: "not really" } ] },
  { key: "profit-2", dim: "profit", text: "Our prices are set:", anchors: [
    { value: 3, label: "deliberately, and reviewed" }, { value: 2, label: "with some logic" },
    { value: 1, label: "mostly on gut or history" }, { value: 0, label: "by habit — not revisited" } ] },
  { key: "profit-3", dim: "profit", text: "Which products or services actually make the money is:", anchors: [
    { value: 3, label: "clear, with numbers" }, { value: 2, label: "fairly well known" },
    { value: 1, label: "a hunch" }, { value: 0, label: "a guess" } ] },

  { key: "customers-1", dim: "customers", text: "Our largest customer is:", anchors: [
    { value: 3, label: "under a tenth of revenue" }, { value: 2, label: "around a fifth" },
    { value: 1, label: "around a third" }, { value: 0, label: "big enough that losing them would threaten us" } ] },
  { key: "customers-2", dim: "customers", text: "New business for the next quarter is:", anchors: [
    { value: 3, label: "known and healthy" }, { value: 2, label: "roughly visible" },
    { value: 1, label: "thin or uncertain" }, { value: 0, label: "not visible at all" } ] },
  { key: "customers-3", dim: "customers", text: "Customers who buy once come back:", anchors: [
    { value: 3, label: "predictably — most do" }, { value: 2, label: "often" },
    { value: 1, label: "sometimes" }, { value: 0, label: "rarely — it's always new hunting" } ] },

  { key: "operations-1", dim: "operations", text: "When work backs up, where it jams is:", anchors: [
    { value: 3, label: "known — and we've addressed it" }, { value: 2, label: "known, but it persists" },
    { value: 1, label: "something I can guess at" }, { value: 0, label: "unclear — it just gets slow" } ] },
  { key: "operations-2", dim: "operations", text: "Work goes out right the first time:", anchors: [
    { value: 3, label: "nearly always" }, { value: 2, label: "usually" },
    { value: 1, label: "often after rework" }, { value: 0, label: "rework is constant" } ] },
  { key: "operations-3", dim: "operations", text: "We deliver what we promised, when we promised:", anchors: [
    { value: 3, label: "reliably" }, { value: 2, label: "most of the time" },
    { value: 1, label: "with frequent slips" }, { value: 0, label: "our promises tend to be optimistic" } ] },

  { key: "team-1", dim: "team", text: "If one key person left, the business would:", anchors: [
    { value: 3, label: "carry on fine" }, { value: 2, label: "wobble briefly" },
    { value: 1, label: "struggle for months" }, { value: 0, label: "be in real trouble" } ] },
  { key: "team-2", dim: "team", text: "People know what they own and are accountable for:", anchors: [
    { value: 3, label: "clearly, in writing" }, { value: 2, label: "mostly" },
    { value: 1, label: "fuzzily at the edges" }, { value: 0, label: "it's improvised" } ] },
  { key: "team-3", dim: "team", text: "Work gets done without me touching it:", anchors: [
    { value: 3, label: "routinely" }, { value: 2, label: "for most things" },
    { value: 1, label: "only the simple things" }, { value: 0, label: "almost everything needs me" } ] },

  { key: "owner-1", dim: "owner", text: "My working week is:", anchors: [
    { value: 3, label: "sustainable, by design" }, { value: 2, label: "long but manageable" },
    { value: 1, label: "heavier than I'd like" }, { value: 0, label: "more than I can keep up with" } ] },
  { key: "owner-2", dim: "owner", text: "Decisions route through me:", anchors: [
    { value: 3, label: "only the big ones" }, { value: 2, label: "the big and some medium" },
    { value: 1, label: "most of them" }, { value: 0, label: "all of them, constantly" } ] },
  { key: "owner-3", dim: "owner", text: "The business could run for two weeks without me:", anchors: [
    { value: 3, label: "easily" }, { value: 2, label: "with some prep" },
    { value: 1, label: "barely, and roughly" }, { value: 0, label: "not at all" } ] },
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
    low: "Your answers point to cash you're steering partly blind — the position, the runway, or how fast money comes in isn't visible enough to plan against. That's the gap that turns a normal slow month into a scramble. First move: build a one-page, 13-week cash forecast and update it every Friday, even roughly.",
    moderate: "You have a working handle on cash, but there's slack in the picture — a number you carry as “roughly” rather than known. Tightening it buys earlier warning. First move: pick the softest of the three — position, runway, or collections — and make it exact this week.",
  },
  profit: {
    low: "The answers suggest profit is something you feel more than see — margins, pricing, or mix aren't backed by numbers yet. Revenue can climb while the money quietly doesn't. First move: take your top three sellers and work out the true margin on each, then look at what that says about your prices.",
    moderate: "You know profit is there but not exactly where it's made — one of margin, pricing, or mix is still a hunch. Naming it usually surfaces easy money. First move: check the price on your best-selling item against its real cost and decide if it's set on purpose.",
  },
  customers: {
    low: "Your answers flag customer risk — either one account carries too much weight, the pipeline is thin, or buyers don't come back. Any one of those makes revenue fragile. First move: write down what share of revenue your largest customer is; if it's near a third or more, start one concrete step toward a second anchor account.",
    moderate: "The customer base is holding, but there's a soft spot — concentration, pipeline, or repeat business isn't as strong as the rest. First move: look at next quarter's known work, and if it's thin, block two hours a week for outreach before you need it.",
  },
  operations: {
    low: "The answers point to delivery that runs on effort rather than a system — bottlenecks, rework, or missed promises show up more than they should. That tax stays invisible until you look. First move: track where work actually stalls for one week, then fix the single most common jam.",
    moderate: "Operations mostly hold, but something slips more than you'd like — a recurring bottleneck, some rework, or the odd late promise. First move: pick the one step that most often forces a redo and tighten it before it spreads.",
  },
  team: {
    low: "Your answers suggest the business leans hard on specific people — if a key person left, or roles blur, it would hurt. That's key-person risk, and it quietly caps how far you can grow. First move: write down what only one person knows how to do, and start documenting the most critical of those this month.",
    moderate: "The team works, but there's a dependency or a fuzzy role that would bite under pressure. First move: name the one task that would stall if its owner were out for two weeks, and have them write down how it's done.",
  },
  owner: {
    low: "The answers point to a business that still runs through you — the hours, the decision load, or not being able to step away all say the owner is the bottleneck. That's the most common ceiling on a good business. First move: list every decision that routed through you this week and pick one type to hand off with a clear rule.",
    moderate: "You've built something that mostly works, but you're still closer to the center of it than you'd like. First move: choose one recurring decision you make today and give someone else the rule to make it without you.",
  },
};

export function writtenRead(result) {
  const scored = result.dimensions.filter((d) => d.score0to100 !== null);
  const weakestTwo = [...scored]
    .sort((a, b) => a.score0to100 - b.score0to100)
    .slice(0, 2);
  return weakestTwo.map((d) => {
    const band = d.score0to100 < 50 ? "low" : "moderate";
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

function renderResults(result, root) {
  const needle = root.querySelector("#hc-needle");
  const overallText = root.querySelector("#hc-overall");
  if (result.overall0to100 !== null) {
    if (needle) needle.setAttribute("transform", `rotate(${needleAngle(result.overall0to100)} 100 100)`);
    if (overallText) overallText.textContent = String(result.overall0to100);
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
      const v = saved[q.key];
      if (v === undefined) continue;
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
    results.scrollIntoView({ behavior: "smooth", block: "start" });
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
