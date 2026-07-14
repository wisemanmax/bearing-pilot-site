document.documentElement.classList.add("js");

const reveals = document.querySelectorAll(".reveal");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduceMotion = reducedMotionQuery.matches;
const masthead = document.querySelector(".masthead");

let scrollFrame = 0;
function compactMasthead() {
  masthead.classList.toggle("scrolled", window.scrollY > 48);
  scrollFrame = 0;
}

function queueMastheadCompaction() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(compactMasthead);
}

function setMastheadCompaction(enabled) {
  if (!masthead) return;
  window.removeEventListener("scroll", queueMastheadCompaction);
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  if (enabled) {
    compactMasthead();
    window.addEventListener("scroll", queueMastheadCompaction, { passive: true });
  } else {
    masthead.classList.remove("scrolled");
  }
}

if (masthead && !reduceMotion) {
  setMastheadCompaction(true);
}

function showAll() {
  reveals.forEach((element) => element.classList.add("in-view"));
}

if (reduceMotion || !("IntersectionObserver" in window)) {
  showAll();
} else {
  let fired = false;
  const observer = new IntersectionObserver((entries) => {
    fired = true;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("in-view");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0, rootMargin: "0px 0px -60px" });

  reveals.forEach((element) => observer.observe(element));

  // A conforming observer reports initial entries for every observed element right away.
  // Some embedded and privacy-hardened browsers expose an IntersectionObserver that never
  // calls back at all — without this net, every .reveal would stay invisible forever.
  setTimeout(() => {
    if (!fired) {
      observer.disconnect();
      showAll();
    }
  }, 1200);
}

// --- Scroll progress hairline ---------------------------------------------
// A decorative brass line under the sticky masthead, filled by scroll position
// through the CSS scroll() timeline. Injected here so no HTML file is touched,
// and only when motion is welcome — the fill itself is pure CSS.
if (masthead && !reduceMotion) {
  const progress = document.createElement("div");
  progress.className = "scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  masthead.appendChild(progress);
}

// --- Magnetic primary CTAs -------------------------------------------------
// On pointer devices, a .cta eases up to 3px toward the cursor, then settles
// back on leave. Skipped entirely under reduced motion or coarse/no pointers.
const MAX_PULL = 3;
const magneticCtas = [...document.querySelectorAll(".cta")].map((cta) => {
  const state = {
    cta,
    current: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    raf: 0,
    enabled: false,
  };

  state.step = () => {
    state.current.x += (state.target.x - state.current.x) * 0.18;
    state.current.y += (state.target.y - state.current.y) * 0.18;
    const settled =
      Math.abs(state.target.x - state.current.x) < 0.05 &&
      Math.abs(state.target.y - state.current.y) < 0.05;
    if (settled) {
      state.current = { x: state.target.x, y: state.target.y };
      state.raf = 0;
      if (state.target.x === 0 && state.target.y === 0) {
        cta.style.transform = "";
        return;
      }
    }
    cta.style.transform = `translate(${state.current.x.toFixed(2)}px, ${state.current.y.toFixed(2)}px)`;
    if (!settled) state.raf = requestAnimationFrame(state.step);
  };

  state.pull = (event) => {
    const rect = cta.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    state.target = {
      x: Math.max(-1, Math.min(1, dx)) * MAX_PULL,
      y: Math.max(-1, Math.min(1, dy)) * MAX_PULL,
    };
    if (!state.raf) state.raf = requestAnimationFrame(state.step);
  };

  state.leave = () => {
    state.target = { x: 0, y: 0 };
    if (!state.raf) state.raf = requestAnimationFrame(state.step);
  };
  return state;
});

function setMagneticCtas(enabled) {
  for (const state of magneticCtas) {
    if (enabled && !state.enabled) {
      state.cta.addEventListener("pointermove", state.pull);
      state.cta.addEventListener("pointerleave", state.leave);
      state.enabled = true;
    } else if (!enabled && state.enabled) {
      state.cta.removeEventListener("pointermove", state.pull);
      state.cta.removeEventListener("pointerleave", state.leave);
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      state.current = { x: 0, y: 0 };
      state.target = { x: 0, y: 0 };
      state.cta.style.transform = "";
      state.enabled = false;
    }
  }
}

if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
  setMagneticCtas(true);
}

reducedMotionQuery.addEventListener("change", (event) => {
  reduceMotion = event.matches;
  setMastheadCompaction(!reduceMotion);
  setMagneticCtas(!reduceMotion && window.matchMedia("(hover: hover)").matches);
  if (reduceMotion) showAll();
});

// --- First Look result entrance -------------------------------------------
// first-look.mjs owns the form; here we only watch its result region and add a
// class the moment it unhides, letting motion.css animate the reveal.
if (!reduceMotion) {
  const result = document.querySelector("#first-look-result");
  if (result && "MutationObserver" in window) {
    const resultObserver = new MutationObserver(() => {
      if (!result.hidden) result.classList.add("result-in");
    });
    resultObserver.observe(result, { attributes: true, attributeFilter: ["hidden"] });
  }
}
