document.documentElement.classList.add("js");

const reveals = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const masthead = document.querySelector(".masthead");

let scrollQueued = false;
function compactMasthead() {
  masthead.classList.toggle("scrolled", window.scrollY > 48);
  scrollQueued = false;
}
if (masthead && !reduceMotion) {
  compactMasthead();
  window.addEventListener("scroll", () => {
    if (!scrollQueued) requestAnimationFrame(compactMasthead);
    scrollQueued = true;
  }, { passive: true });
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
if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
  const MAX_PULL = 3;
  for (const cta of document.querySelectorAll(".cta")) {
    let current = { x: 0, y: 0 };
    let target = { x: 0, y: 0 };
    let raf = 0;

    const step = () => {
      current.x += (target.x - current.x) * 0.18;
      current.y += (target.y - current.y) * 0.18;
      const settled =
        Math.abs(target.x - current.x) < 0.05 && Math.abs(target.y - current.y) < 0.05;
      if (settled) {
        current = { x: target.x, y: target.y };
        raf = 0;
        if (target.x === 0 && target.y === 0) {
          cta.style.transform = "";
          return;
        }
      }
      cta.style.transform = `translate(${current.x.toFixed(2)}px, ${current.y.toFixed(2)}px)`;
      if (!settled) raf = requestAnimationFrame(step);
    };

    const pull = (event) => {
      const rect = cta.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      target = {
        x: Math.max(-1, Math.min(1, dx)) * MAX_PULL,
        y: Math.max(-1, Math.min(1, dy)) * MAX_PULL,
      };
      if (!raf) raf = requestAnimationFrame(step);
    };

    cta.addEventListener("pointermove", pull);
    cta.addEventListener("pointerleave", () => {
      target = { x: 0, y: 0 };
      if (!raf) raf = requestAnimationFrame(step);
    });
  }
}

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
