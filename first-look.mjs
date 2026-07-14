import { bookingUrl, supabaseKey, supabaseUrl } from "./site-config.mjs";

// Booking handoff. Only a non-blank https:// URL activates the CTA; anything
// else (blank config, http, javascript:, malformed) leaves it disabled.
export function safeBookingUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  return url.protocol === "https:" ? url.href : null;
}

// Applies the booking state to the CTA anchor. Returns true when active.
export function applyBookingState(link, configuredUrl) {
  const url = safeBookingUrl(configuredUrl);
  if (url) {
    link.setAttribute("href", url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    link.removeAttribute("aria-disabled");
  } else {
    link.removeAttribute("href");
    link.setAttribute("aria-disabled", "true");
  }
  return url !== null;
}

// First Look: five answers scored 0-2, summed to a directional state.
const FIRST_LOOK_STATES = [
  { min: 9, state: "Advancing", message: "You know this business well. A reading confirms your priorities and pressure-tests the next move." },
  { min: 7, state: "Steady", message: "You have a working picture. The value now is ranking what matters most for the next 90 days." },
  { min: 4, state: "Oriented", message: "You can see the shape of things. A First Bearing would sharpen what to do first." },
  { min: 0, state: "Adrift", message: "The picture is blurry right now. That's common, and it's fixable — one page can make it plain." },
];

export function scoreFirstLook(values) {
  const total = values.reduce((sum, v) => sum + v, 0);
  return FIRST_LOOK_STATES.find((band) => total >= band.min);
}

export function firstLookBand(score) {
  if (score >= 7) return "steady";
  if (score >= 4) return "drifting";
  return "adrift";
}

export async function sendFirstLookTelemetry(
  score,
  configuredUrl = supabaseUrl,
  configuredKey = supabaseKey,
  request = globalThis.fetch,
) {
  if (typeof configuredUrl !== "string" || configuredUrl.trim() === "") return false;
  if (typeof configuredKey !== "string" || configuredKey.trim() === "") return false;

  try {
    const response = await request(
      `${configuredUrl.replace(/\/+$/, "")}/rest/v1/bearing_first_look`,
      {
        method: "POST",
        headers: {
          apikey: configuredKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ score, band: firstLookBand(score) }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

let telemetrySent = false;

if (typeof document !== "undefined") {
  const link = document.querySelector("#book-cta");
  const note = document.querySelector("#booking-note");
  if (link) {
    let active = applyBookingState(link, bookingUrl);
    // Calendar-later seam: with no external calendar configured, route the CTA
    // to the booking-request form when the Supabase backend is available.
    if (!active && supabaseUrl.trim() !== "" && supabaseKey.trim() !== "") {
      link.setAttribute("href", "booking.html");
      link.removeAttribute("aria-disabled");
      active = true;
      if (note) {
        note.textContent =
          "Booking requests are open — propose times that suit you and get a confirmation within two business days.";
        note.hidden = false;
      }
    } else if (note) {
      note.hidden = active;
    }
  }

  const form = document.querySelector("#first-look-form");
  const result = document.querySelector("#first-look-result");
  if (form && result) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const answers = ["q1", "q2", "q3", "q4", "q5"].map((name) => data.get(name));
      result.hidden = false;
      if (answers.some((value) => value === null)) {
        result.textContent = "Answer all five questions to get your reading.";
        return;
      }
      const scores = answers.map(Number);
      const score = scores.reduce((sum, value) => sum + value, 0);
      const { state, message } = scoreFirstLook(scores);
      result.textContent = `${state} — ${message}`;
      if (!telemetrySent && supabaseUrl.trim() !== "" && supabaseKey.trim() !== "") {
        telemetrySent = true;
        void sendFirstLookTelemetry(score);
      }
    });
  }
}
