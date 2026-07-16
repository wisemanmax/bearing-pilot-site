// Health Check stepper — one question at a time. A progressive-enhancement
// layer over the existing 18-question form: with JavaScript off (or this
// module absent) the full-length form still works exactly as before. The
// stepper only reorganizes what is visible; the underlying inputs, autosave,
// scoring, and submit flow in health-check.mjs are untouched.

// One plain sentence of context per dimension — the "consideration" shown in a
// hover/focus bubble beside the dimension label, never as a wall of text.
export const DIMENSION_NOTES = {
  cash: "Whether you can see your money clearly enough to steer — what's spendable, how long it lasts, how fast it arrives.",
  profit: "Whether the work pays for itself — true costs, honest pricing, and where the current path leads.",
  customers: "How sturdy the income base is — concentration, what's coming, and what repeats without re-winning it.",
  operations: "Whether the books could face a funder, lender, or auditor this week without a scramble.",
  team: "Whether your bank would say yes before you need them to — relationships, likely terms, fine print.",
  owner: "Whether money is controlled by structure or by trust — approvals, separation, and board-ready numbers.",
};

// Pure step math, unit-testable: given counts, describe the step position.
export function stepLabel(index, total) {
  return `Question ${index + 1} of ${total}`;
}

export function firstUnanswered(answeredFlags) {
  const i = answeredFlags.findIndex((answered) => !answered);
  return i === -1 ? answeredFlags.length : i;
}

export function initStepper(doc = document) {
  const form = doc.querySelector("#health-form");
  if (!form || form.classList.contains("hc-stepping")) return null;
  const questions = [...form.querySelectorAll(".hc-q")];
  const actions = form.querySelector(".health-actions");
  if (questions.length === 0 || !actions) return null;

  const reduceMotion = typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  form.classList.add("hc-stepping");

  // --- Header: progress line + brass fill, aria-live so AT hears movement ----
  const head = doc.createElement("div");
  head.className = "hc-step-head";
  head.innerHTML = `
    <p class="hc-step-progress" role="status" aria-live="polite"></p>
    <div class="hc-step-track" aria-hidden="true"><span class="hc-step-fill"></span></div>
    <p class="hc-step-dim">
      <span class="hc-step-dim-label"></span>
      <span class="hc-info-wrap">
        <button type="button" class="hc-info" aria-expanded="false">
          <span aria-hidden="true">?</span>
          <span class="visually-hidden">What this dimension covers</span>
        </button>
        <span class="hc-info-bubble" role="note"></span>
      </span>
    </p>`;
  form.prepend(head);

  const progressEl = head.querySelector(".hc-step-progress");
  const fillEl = head.querySelector(".hc-step-fill");
  const dimLabelEl = head.querySelector(".hc-step-dim-label");
  const infoBtn = head.querySelector(".hc-info");
  const infoBubble = head.querySelector(".hc-info-bubble");

  infoBtn.addEventListener("click", () => {
    const open = infoBtn.getAttribute("aria-expanded") === "true";
    infoBtn.setAttribute("aria-expanded", open ? "false" : "true");
    head.classList.toggle("hc-info-open", !open);
  });

  // --- Footer: back / skip controls ------------------------------------------
  const nav = doc.createElement("div");
  nav.className = "hc-step-nav";
  nav.innerHTML = `
    <button type="button" class="cta cta-secondary hc-step-back">Back</button>
    <button type="button" class="cta cta-secondary hc-step-skip">Skip for now</button>`;
  actions.before(nav);
  const backBtn = nav.querySelector(".hc-step-back");
  const skipBtn = nav.querySelector(".hc-step-skip");

  const total = questions.length;
  const answered = () => questions.map((q) => !!q.querySelector("input:checked"));
  let current = 0;
  let advanceTimer = 0;

  function dimensionOf(question) {
    const section = question.closest(".hc-dimension");
    return {
      key: section?.dataset.dimension || "",
      label: section?.querySelector("h2")?.textContent || "",
      num: section?.querySelector(".section-num")?.textContent || "",
    };
  }

  function show(index, { focus = true } = {}) {
    clearTimeout(advanceTimer);
    advanceTimer = 0;
    current = Math.max(0, Math.min(index, total));
    const finished = current === total;

    questions.forEach((q, i) => q.classList.toggle("hc-q-current", i === current));
    form.classList.toggle("hc-step-finished", finished);

    if (finished) {
      progressEl.textContent = "All questions seen — ready when you are.";
      fillEl.style.width = "100%";
      dimLabelEl.textContent = "Your read awaits";
      infoBubble.textContent = "Unanswered questions simply stay out of your scores.";
    } else {
      const dim = dimensionOf(questions[current]);
      progressEl.textContent = stepLabel(current, total);
      fillEl.style.width = `${Math.round((current / total) * 100)}%`;
      dimLabelEl.textContent = `${dim.num} ${dim.label}`.trim();
      infoBubble.textContent = DIMENSION_NOTES[dim.key] || "";
    }
    infoBtn.setAttribute("aria-expanded", "false");
    head.classList.remove("hc-info-open");

    backBtn.disabled = current === 0;
    skipBtn.hidden = finished;

    if (focus && !finished) {
      questions[current].querySelector("legend")?.setAttribute("tabindex", "-1");
      questions[current].querySelector("legend")?.focus();
    }
  }

  // Answering advances after a short beat (instantly under reduced motion),
  // so the selection ignite reads before the next question arrives.
  form.addEventListener("change", (event) => {
    if (!event.target.matches?.('.hc-q input[type="radio"]')) return;
    const q = event.target.closest(".hc-q");
    if (questions[current] !== q) return;
    clearTimeout(advanceTimer);
    if (reduceMotion) {
      show(current + 1);
    } else {
      advanceTimer = setTimeout(() => show(current + 1), 340);
    }
  });

  backBtn.addEventListener("click", () => show(current - 1));
  skipBtn.addEventListener("click", () => show(current + 1));

  // Start fresh returns to the first question after health-check.mjs clears.
  form.querySelector("#health-fresh-start")?.addEventListener("click", () => {
    setTimeout(() => show(0, { focus: false }), 0);
  });

  // Land on the first unanswered question (autosave restore may have filled
  // some) — never yanking focus on initial load.
  show(firstUnanswered(answered()), { focus: false });

  return { show, get current() { return current; } };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initStepper(), { once: true });
  } else {
    initStepper();
  }
}
