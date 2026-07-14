import { bookingUrl, supabaseKey, supabaseUrl } from "./site-config.mjs";
import { safeBookingUrl } from "./first-look.mjs";

// Calendar-later seam. Resolves how the booking page should behave from the
// three config switches, without touching the DOM:
//   - a safe https:// bookingUrl wins  -> { mode: "external", url }
//   - blank bookingUrl but Supabase set -> { mode: "request-form" }
//   - anything else (incl. http:/javascript: URLs) -> { mode: "closed" }
// When a real calendar exists, setting bookingUrl in site-config.mjs flips the
// page to a direct link with no code change here.
export function resolveBookingDestination({ bookingUrl, supabaseUrl, supabaseKey } = {}) {
  const url = safeBookingUrl(bookingUrl);
  if (url) return { mode: "external", url };

  // request-form is only for a *blank* bookingUrl. A non-blank but unsafe URL
  // (http:, javascript:, malformed) is a misconfiguration, not an invitation to
  // fall back — treat it as closed even when Supabase is configured.
  const bookingBlank = typeof bookingUrl !== "string" || bookingUrl.trim() === "";
  const hasSupabase =
    typeof supabaseUrl === "string" && supabaseUrl.trim() !== "" &&
    typeof supabaseKey === "string" && supabaseKey.trim() !== "";
  if (bookingBlank && hasSupabase) return { mode: "request-form" };

  return { mode: "closed" };
}

// A request needs a name, a plausible email, a timezone, and at least one
// preferred window. Returns the list of missing/invalid field names.
export function validateBookingRequest({ name, email, timezone, windows }) {
  const errors = [];
  if (typeof name !== "string" || name.trim() === "") errors.push("name");
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) errors.push("email");
  if (typeof timezone !== "string" || timezone.trim() === "") errors.push("timezone");
  if (!Array.isArray(windows) || windows.length === 0) errors.push("windows");
  return errors;
}

// Write-only insert into bearing_booking_requests. Mirrors the First Look
// telemetry call: blank config is a silent no-op, network/non-2xx failures
// return false so the caller can keep the user's input and offer a retry.
export async function submitBookingRequest(
  payload,
  configuredUrl = supabaseUrl,
  configuredKey = supabaseKey,
  request = globalThis.fetch,
) {
  if (typeof configuredUrl !== "string" || configuredUrl.trim() === "") return false;
  if (typeof configuredKey !== "string" || configuredKey.trim() === "") return false;

  try {
    const response = await request(
      `${configuredUrl.replace(/\/+$/, "")}/rest/v1/bearing_booking_requests`,
      {
        method: "POST",
        headers: {
          apikey: configuredKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

if (typeof document !== "undefined") {
  const requestSection = document.querySelector("#booking-request");
  const externalSection = document.querySelector("#booking-external");
  const closedSection = document.querySelector("#booking-closed");

  const destination = resolveBookingDestination({ bookingUrl, supabaseUrl, supabaseKey });

  if (requestSection) requestSection.hidden = destination.mode !== "request-form";
  if (externalSection) externalSection.hidden = destination.mode !== "external";
  if (closedSection) closedSection.hidden = destination.mode !== "closed";

  if (destination.mode === "external") {
    const link = document.querySelector("#booking-external-link");
    if (link) {
      link.setAttribute("href", destination.url);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  }

  if (destination.mode === "request-form") {
    const form = document.querySelector("#booking-form");
    const submit = document.querySelector("#booking-submit");
    const status = document.querySelector("#booking-status");
    const success = document.querySelector("#booking-success");

    if (form && submit && status && success) {
      let submitting = false;

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submitting) return;

        const data = new FormData(form);
        const windows = [1, 2, 3]
          .map((i) => ({ day: (data.get(`day${i}`) || "").trim(), time: (data.get(`time${i}`) || "").trim() }))
          .filter((window) => window.day !== "");

        // Fold the "other" timezone detail into the timezone value and the
        // earliest-date into the note, so the request is schedulable without
        // changing the stored shape.
        let timezone = (data.get("timezone") || "").trim();
        const timezoneOther = (data.get("timezone-other") || "").trim();
        if (timezone === "other" && timezoneOther) timezone = `Other: ${timezoneOther}`;

        const noteParts = [];
        const rawNote = (data.get("note") || "").trim();
        if (rawNote) noteParts.push(rawNote);
        const earliest = (data.get("earliest-date") || "").trim();
        if (earliest) noteParts.push(`Earliest date: ${earliest}`);

        const payload = {
          name: (data.get("name") || "").trim(),
          email: (data.get("email") || "").trim(),
          business_name: (data.get("business_name") || "").trim() || null,
          note: noteParts.join(" · ") || null,
          timezone,
          windows,
          honeypot_tripped: (data.get("company") || "").trim() !== "",
        };

        if (validateBookingRequest(payload).length > 0) {
          status.hidden = false;
          status.textContent =
            "Add your name, a valid email, a timezone, and at least one preferred time window.";
          return;
        }

        submitting = true;
        submit.disabled = true;
        submit.textContent = "Sending…";
        status.hidden = true;

        const ok = await submitBookingRequest(payload);
        if (ok) {
          form.hidden = true;
          success.hidden = false;
        } else {
          submitting = false;
          submit.disabled = false;
          submit.textContent = "Request my First Bearing";
          status.hidden = false;
          status.textContent =
            "That didn't send — your details are still here. Please try again in a moment.";
        }
      });
    }
  }
}
