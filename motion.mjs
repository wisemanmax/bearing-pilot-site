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

// --- Scroll-reactive compass field -----------------------------------------
// The brand compass, enlarged behind the dark intro band. Injected here so no
// HTML file is touched; the band keeps its own dark background, so with JS off
// there is simply no compass and no contrast change. motion.css drives it
// natively via scroll() timelines where supported; this runs a rAF fallback
// (with slight inertial easing on the needle) only when they are not — and
// never on very small viewports, where it would cost frames.
const COMPASS_MARKUP = `
<div class="compass-field" aria-hidden="true">
  <svg class="compass-field__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <g class="compass-field__ring">
      <circle cx="50" cy="50" r="33"></circle>
      <g class="compass-field__ticks">
        <path d="M50 12v9 M50 88v-9 M12 50h9 M88 50h-9"></path>
        <path d="M71.2 28.8l4.3-4.3 M71.2 71.2l4.3 4.3 M28.8 71.2l-4.3 4.3 M28.8 28.8l-4.3-4.3"></path>
      </g>
    </g>
    <path class="compass-field__needle" d="M50 13L54 46L75 50L54 54L50 87L46 54L25 50L46 46Z"></path>
    <circle class="compass-field__hub" cx="50" cy="50" r="4.5"></circle>
  </svg>
</div>`;

const compassBand = document.querySelector(".hero, .page-intro.depth-band");
let compassCleanup = null;

function setCompassMotion(enabled) {
  const field = compassBand?.querySelector(".compass-field");
  if (!field) return;
  if (compassCleanup) { compassCleanup(); compassCleanup = null; }

  // Native scroll timelines and reduced motion are handled entirely in CSS;
  // the JS driver is only for browsers without animation-timeline support.
  const nativeScroll = CSS.supports?.("animation-timeline: scroll()");
  const small = window.matchMedia("(max-width: 640px)").matches;
  if (!enabled || nativeScroll || small) return;

  const needle = field.querySelector(".compass-field__needle");
  const ring = field.querySelector(".compass-field__ring");
  const svg = field.querySelector(".compass-field__svg");
  const ROTATION_RANGE = 300;
  let current = 0;
  let raf = 0;

  const draw = () => {
    raf = 0;
    // Match the native timeline's range: the full sweep plays over the first
    // ~viewport of scroll, while the intro band is still on screen.
    const max = window.innerHeight * 0.92;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    const target = p * ROTATION_RANGE;
    current += (target - current) * 0.12; // inertia — weighted, not linear
    needle.style.rotate = `${current.toFixed(2)}deg`;
    ring.style.rotate = `${(current * -0.4).toFixed(2)}deg`;
    svg.style.scale = (1 + p * 0.14).toFixed(3);
    svg.style.translate = `0 ${(p * 5 - 3).toFixed(2)}vh`;
    if (Math.abs(target - current) > 0.05) raf = requestAnimationFrame(draw);
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(draw); };
  window.addEventListener("scroll", onScroll, { passive: true });
  draw();

  compassCleanup = () => {
    window.removeEventListener("scroll", onScroll);
    if (raf) cancelAnimationFrame(raf);
    for (const el of [needle, ring, svg]) {
      el.style.rotate = "";
      el.style.scale = "";
      el.style.translate = "";
    }
  };
}

if (compassBand) {
  // Wrap the band's content so it can depart as one unit on scroll — drifting
  // up and dimming while the compass behind it holds course. The wrapper is
  // structural only; with scroll timelines unsupported it changes nothing.
  const depart = document.createElement("div");
  depart.className = "band-depart";
  while (compassBand.firstChild) depart.append(compassBand.firstChild);
  compassBand.append(depart);
  compassBand.insertAdjacentHTML("afterbegin", COMPASS_MARKUP);
  setCompassMotion(!reduceMotion);
}

// --- Pointer spring --------------------------------------------------------
// One underdamped spring drives every pointer interaction (magnetic CTAs,
// card tilt): position accelerates toward the target and overshoots slightly
// before settling — movement gets bounce, in the M3 sense of a spatial
// spring, while opacity and color never do. The same integrator also absorbs
// interruptions: retargeting mid-flight just bends the spring.
const SPRING_K = 0.09;
const SPRING_DAMP = 0.78;

function springStep(state) {
  state.vx = (state.vx + (state.target.x - state.current.x) * SPRING_K) * SPRING_DAMP;
  state.vy = (state.vy + (state.target.y - state.current.y) * SPRING_K) * SPRING_DAMP;
  state.current.x += state.vx;
  state.current.y += state.vy;
  return (
    Math.abs(state.target.x - state.current.x) < 0.05 &&
    Math.abs(state.target.y - state.current.y) < 0.05 &&
    Math.abs(state.vx) + Math.abs(state.vy) < 0.02
  );
}

// --- Magnetic primary CTAs -------------------------------------------------
// On pointer devices, a .cta springs up to 3px toward the cursor, then
// settles back on leave. Skipped under reduced motion or coarse/no pointers.
const MAX_PULL = 3;
const magneticCtas = [...document.querySelectorAll(".cta")].map((cta) => {
  const state = {
    cta,
    current: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    vx: 0,
    vy: 0,
    raf: 0,
    enabled: false,
  };

  state.step = () => {
    const settled = springStep(state);
    if (settled) {
      state.current = { x: state.target.x, y: state.target.y };
      state.vx = 0;
      state.vy = 0;
      state.raf = 0;
      if (state.target.x === 0 && state.target.y === 0) {
        cta.style.transform = "";
        return;
      }
    }
    // Bloom slightly with the pull, so the button feels drawn, not dragged.
    const pull = Math.min(1, Math.hypot(state.current.x, state.current.y) / MAX_PULL);
    cta.style.transform =
      `translate(${state.current.x.toFixed(2)}px, ${state.current.y.toFixed(2)}px)` +
      ` scale(${(1 + pull * 0.02).toFixed(4)})`;
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
      state.vx = 0;
      state.vy = 0;
      state.cta.style.transform = "";
      state.enabled = false;
    }
  }
}

if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
  setMagneticCtas(true);
}

// --- Card tilt ---------------------------------------------------------------
// Offer cards and the One-Page Truth tilt gently toward the pointer with the
// same weighted easing as the magnetic CTAs. The tilt drives the independent
// rotate/scale properties — never transform — so the scroll-driven arrival
// animations keep owning transform and both compose. Pointer devices only.
const TILT_MAX_DEG = 3.2;
const tiltCards = [...document.querySelectorAll(".offer-card, .truth-card")].map((card) => {
  const state = {
    card,
    current: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    vx: 0,
    vy: 0,
    raf: 0,
    enabled: false,
  };

  state.step = () => {
    const settled = springStep(state);
    if (settled) {
      state.current = { x: state.target.x, y: state.target.y };
      state.vx = 0;
      state.vy = 0;
      state.raf = 0;
      if (state.target.x === 0 && state.target.y === 0) {
        card.style.rotate = "";
        card.style.scale = "";
        return;
      }
    }
    // Fold the two tilts into one axis-angle rotation (small-angle compose).
    const angle = Math.hypot(state.current.x, state.current.y);
    if (angle > 0.01) {
      card.style.rotate =
        `${(state.current.y / angle).toFixed(4)} ${(state.current.x / angle).toFixed(4)} 0 ${angle.toFixed(2)}deg`;
      card.style.scale = "1.012";
    }
    if (!settled) state.raf = requestAnimationFrame(state.step);
  };

  state.move = (event) => {
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const py = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    state.target = {
      x: Math.max(-1, Math.min(1, px)) * TILT_MAX_DEG,
      y: Math.max(-1, Math.min(1, -py)) * TILT_MAX_DEG,
    };
    if (!state.raf) state.raf = requestAnimationFrame(state.step);
  };

  state.leave = () => {
    state.target = { x: 0, y: 0 };
    if (!state.raf) state.raf = requestAnimationFrame(state.step);
  };
  return state;
});

function setCardTilt(enabled) {
  for (const state of tiltCards) {
    if (enabled && !state.enabled) {
      state.card.addEventListener("pointermove", state.move);
      state.card.addEventListener("pointerleave", state.leave);
      state.enabled = true;
    } else if (!enabled && state.enabled) {
      state.card.removeEventListener("pointermove", state.move);
      state.card.removeEventListener("pointerleave", state.leave);
      if (state.raf) cancelAnimationFrame(state.raf);
      state.raf = 0;
      state.current = { x: 0, y: 0 };
      state.target = { x: 0, y: 0 };
      state.vx = 0;
      state.vy = 0;
      state.card.style.rotate = "";
      state.card.style.scale = "";
      state.enabled = false;
    }
  }
}

if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
  setCardTilt(true);
}

reducedMotionQuery.addEventListener("change", (event) => {
  reduceMotion = event.matches;
  setMastheadCompaction(!reduceMotion);
  setMagneticCtas(!reduceMotion && window.matchMedia("(hover: hover)").matches);
  setCardTilt(!reduceMotion && window.matchMedia("(hover: hover)").matches);
  setCompassMotion(!reduceMotion);
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
