import { bookingUrl, paymentUrl, supabaseKey, supabaseUrl } from "./site-config.mjs";
import { safeBookingUrl } from "./booking-url.mjs";
import { mountCalendar } from "./booking-calendar.mjs";

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
// preferred date+time. Returns the list of missing/invalid field names. Each
// window carries a concrete { date, time } chosen on the calendar.
export function validateBookingRequest({ name, email, timezone, windows }) {
  const errors = [];
  if (typeof name !== "string" || name.trim() === "") errors.push("name");
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) errors.push("email");
  if (typeof timezone !== "string" || timezone.trim() === "") errors.push("timezone");
  const validWindows = Array.isArray(windows) && windows.length > 0 &&
    windows.every((w) => w && typeof w.date === "string" && w.date.trim() !== "" &&
      typeof w.time === "string" && w.time.trim() !== "");
  if (!validWindows) errors.push("windows");
  return errors;
}

// Fold the richer, structured intake (organization type, focus, meeting format,
// phone) and the free-text prompt into one founder-readable note, capped to the
// column's 2000-char limit. Order is deliberate: the qualitative context first,
// then the visitor's own words. Returns null when nothing was supplied.
export function composeBookingNote({ orgType, focus, format, phone, message, termsProposal } = {}) {
  const meta = [];
  if (orgType && orgType.trim()) meta.push(`Organization type: ${orgType.trim()}`);
  if (focus && focus.trim()) meta.push(`Focus: ${focus.trim()}`);
  if (format && format.trim()) meta.push(`Preferred format: ${format.trim()}`);
  if (phone && phone.trim()) meta.push(`Phone: ${phone.trim()}`);
  if (termsProposal && termsProposal.trim()) meta.push(`Proposed terms: ${termsProposal.trim()}`);
  const words = (message || "").trim();
  const parts = [];
  if (meta.length) parts.push(meta.join("\n"));
  if (words) parts.push(words);
  const note = parts.join("\n\n");
  return note ? note.slice(0, 2000) : null;
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
    const calRoot = document.querySelector("#booking-calendar");
    const picksRoot = document.querySelector("#booking-picks");
    const picksCount = document.querySelector("#booking-picks-count");

    if (form && submit && status && success && calRoot && picksRoot) {
      let submitting = false;

      // The calendar owns the preferred-slot state; it reports the live count so
      // the form can reflect how many of the three slots are chosen.
      const calendar = mountCalendar({
        calRoot,
        picksRoot,
        onChange: ({ count, full }) => {
          if (picksCount) {
            picksCount.textContent = count === 0
              ? "No preferred times chosen yet."
              : `${count} of 3 preferred ${count === 1 ? "time" : "times"} chosen${full ? " — that's the most we ask for." : "."}`;
          }
        },
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submitting) return;

        const data = new FormData(form);

        // Fold the "other" timezone detail into the timezone value.
        let timezone = (data.get("timezone") || "").trim();
        const timezoneOther = (data.get("timezone-other") || "").trim();
        if (timezone === "other" && timezoneOther) timezone = `Other: ${timezoneOther}`;

        const windows = calendar.getPicks();

        const payload = {
          name: (data.get("name") || "").trim(),
          email: (data.get("email") || "").trim(),
          business_name: (data.get("business_name") || "").trim() || null,
          note: composeBookingNote({
            orgType: data.get("org_type") || "",
            focus: data.get("focus") || "",
            format: data.get("meeting_format") || "",
            phone: data.get("phone") || "",
            message: data.get("note") || "",
            termsProposal: data.get("terms_proposal") || "",
          }),
          timezone,
          windows,
          honeypot_tripped: (data.get("company") || "").trim() !== "",
        };

        const missing = validateBookingRequest(payload);
        if (missing.length > 0) {
          status.hidden = false;
          status.dataset.tone = "warn";
          status.textContent = missing.includes("windows")
            ? "Choose at least one preferred date and time on the calendar, plus your name, a valid email, and a timezone."
            : "Add your name, a valid email, and a timezone before sending.";
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
          // When a Stripe Payment Link is configured (https only, same
          // validation as the booking URL), offer settlement right away.
          // Founding Pilot Partners apply their code at checkout, so the
          // engagement's full value stays visible.
          const payLink = safeBookingUrl(paymentUrl);
          if (payLink) {
            const pay = document.createElement("span");
            pay.className = "booking-pay";
            pay.append(" If you like, you can settle the $1,500 engagement now — ");
            const anchor = document.createElement("a");
            anchor.href = payLink;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.textContent = "pay securely via Stripe";
            pay.append(anchor, ". Founding Pilot Partners: your code applies at checkout.");
            success.append(pay);
          }
          success.focus?.();
        } else {
          submitting = false;
          submit.disabled = false;
          submit.textContent = "Request my First Bearing";
          status.hidden = false;
          status.dataset.tone = "error";
          status.textContent =
            "That didn't send — your details are still here. Please try again in a moment.";
        }
      });
    }
  }
}
